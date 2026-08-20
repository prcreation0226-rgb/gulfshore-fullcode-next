import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { openai } from "@ai-sdk/openai";
import { generateText, tool } from "ai";
import { z } from "zod";
import { Resend } from "resend";
import UrlMaker from "@/hooks/url-maker";
import { sendAdminLeadAlertEmail } from "@/lib/email/admin-lead-alert";
import { recalculateLeadScore } from "@/lib/leads/services/scoring.service";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
	try {
		const payload = await req.json();
		console.log("[Email Webhook payload received]:", JSON.stringify(payload, null, 2));

		const data = payload.data || payload;
		const fromEmail = data.from || data.sender || data.From;
		const subject = data.subject || data.Subject || "No Subject";
		let textBody = data.text || data.html || data.TextBody || data.HtmlBody || "";

		// If this is a standard Resend webhook, fetch it using email_id if text is missing
		if (!textBody && data.email_id) {
			console.log(`[Email Webhook] Text is missing. Fetching full INBOUND email by ID: ${data.email_id}...`);
			try {
				let emailResponse;
				if ((resend.emails as any).receiving) {
					emailResponse = await (resend.emails as any).receiving.get(data.email_id);
				} else {
					const res = await fetch(`https://api.resend.com/emails/${data.email_id}/receiving`, {
						headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` }
					});
					emailResponse = { data: await res.json() };
				}
				
				if (emailResponse && emailResponse.data) {
					textBody = emailResponse.data.text || emailResponse.data.html || "";
				}
			} catch (err) {
				console.error("[Email Webhook] Error fetching inbound email body:", err);
			}
		}

		// Extract just the new reply, remove the quoted history
		const cleanTextBody = textBody
			.split(/On\s+.*?\s+wrote:/i)[0] // Remove Gmail style quotes
			.split(/-----Original Message-----/i)[0] // Remove Outlook style quotes
			.split(/_{5,}/)[0] // Remove Yahoo style quotes
			.split(/From:\s+/i)[0] // Remove iOS style quotes
			.replace(/^>.*$/gm, "") // Remove remaining > quote lines
			.trim();

		console.log(`[Email Webhook Parsed Data] From: ${fromEmail}, Subject: ${subject}, Text length: ${cleanTextBody?.length}`);

		if (!fromEmail || !cleanTextBody) {
			console.error("[Email Webhook Error] Missing fields. Parsed as:", { fromEmail, subject, text: cleanTextBody ? 'Present' : 'Missing' });
			return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
		}

		// Clean the email address if it comes in format "Name <email@domain.com>"
		const match = fromEmail.match(/<([^>]+)>/);
		const cleanEmail = match ? match[1] : fromEmail.trim();
		console.log(`[Email Webhook] Clean email: ${cleanEmail}`);

		// Find or create the lead by email
		let lead = await prisma.lead.findUnique({
			where: { email: cleanEmail },
		});

		if (!lead) {
			lead = await prisma.lead.create({
				data: {
					email: cleanEmail,
					firstName: "New",
					lastName: "Lead",
					fullName: "New Lead",
					source: "Other",
					status: "New",
				},
			});
		}

		// 1. Save User's Email to AI Chat History
		await prisma.aIChatHistory.create({
			data: {
				leadId: lead.id,
				channel: "email",
				role: "user",
				message: `Subject: ${subject}\n\n${cleanTextBody}`,
			}
		});

		// 2. Fetch past context for the AI
		const pastChats = await prisma.aIChatHistory.findMany({
			where: { leadId: lead.id },
			orderBy: { createdAt: 'asc' },
			take: 20
		});

		// Clean up past chats to filter out debug logs/metadata stored in DB messages
		const formattedHistory = pastChats.map(chat => {
			let cleanMsg = chat.message;
			if (chat.role === "ai") {
				// Strip debug tool arguments and tags appended by onFinish
				cleanMsg = cleanMsg.split(/\n\n\[Displayed \d+ properties\]/i)[0].split(/\n\n\[Searched for properties but found none\]/i)[0];
			}
			return {
				role: chat.role === "ai" ? ("assistant" as const) : ("user" as const),
				content: cleanMsg
			};
		});

		// 3. Generate AI Response using tools (similar to ai/chat route.ts but structured for email)
		// @ts-ignore
		const { text: aiResponse } = await generateText({
			model: openai("gpt-4o-mini"),
			// @ts-ignore
			maxSteps: 5,
			system: `You are an expert AI Real Estate Concierge for Gulfshore Group, working on behalf of Dimitri Schwarz. 
You are replying to an email from a client. Keep your tone highly professional, concise, and helpful. 
Do not use emojis excessively. Format your response exactly like a professional email body (no need for a Subject line, just the email text).

EMAIL DELIVERY INSTRUCTIONS:
- Since you are replying via EMAIL, there is no browser/widget user interface to render property cards. 
- If you find properties or schedule a tour, you MUST write down the details (address, price, beds, baths, and the link to view the details) of the listings directly inside the text of your email response.
- Do not say "allow the UI to render cards" or similar website-specific instructions. List the homes clearly.

BUYER VS. SELLER INTENT DETECTION:
1. BUYER INTENT:
- If the user is looking to buy, rent, or view available homes:
- You MUST immediately call the 'searchProperties' tool with all parameters extracted (city, address, price, beds, baths, pool, propertyType).
- CRITICAL: If the user provides ONLY a location (e.g. "i want properties in Sanibel"), YOU MUST IMMEDIATELY CALL 'searchProperties' WITH THAT CITY!
- DO NOT ask for budget, bedrooms, bathrooms, or criteria BEFORE running the tool! Run the search FIRST and write the property listings in your response.

2. SELLER & PROPERTY LOOKUP:
- If a user wants to SELL a home or check their listings, call the 'checkSellerProperties' tool with their email.
- Provide the seller details and list the link to list properties (/sell) in the email.

Sign off with:
Best regards,
Gulfshore Group AI Concierge
on behalf of Dimitri Schwarz`,
			messages: formattedHistory,
			tools: {
				checkSellerProperties: tool({
					description: "Look up a seller's existing property listings or home valuation requests by their email address, and provide an option/link to add a new property for sale on /sell.",
					inputSchema: z.object({
						email: z.string().describe("The seller's email address to search"),
					}),
					execute: async (args) => {
						const { email } = args;
						if (!email || !email.includes("@")) {
							return {
								found: false,
								email: email || "",
								message: "Please provide a valid email address.",
								addPropertyUrl: "/sell"
							};
						}

						const cleanEmailAddress = email.toLowerCase().trim();
						const matchedLead = await prisma.lead.findUnique({
							where: { email: cleanEmailAddress },
							include: {
								inquiryHistory: {
									orderBy: { createdAt: "desc" }
								}
							}
						});

						if (!matchedLead || !matchedLead.inquiryHistory || matchedLead.inquiryHistory.length === 0) {
							return {
								found: false,
								email: cleanEmailAddress,
								message: `No existing property listings or valuation requests were found for ${cleanEmailAddress}.`,
								addPropertyUrl: "/sell"
							};
						}

						const properties = matchedLead.inquiryHistory.map((inq: any) => {
							let addr = "Property Valuation / Listing Request";
							if (inq.message) {
								const match = inq.message.match(/Property Address:\s*([^\n]+)/i) ||
									inq.message.match(/Property:\s*([^\n]+)/i) ||
									inq.message.match(/Address:\s*([^\n]+)/i);
								if (match && match[1]) {
									addr = match[1].trim();
								}
							}
							return {
								id: inq.id,
								type: inq.type,
								address: addr,
								createdAt: inq.createdAt
							};
						});

						return {
							found: true,
							email: cleanEmailAddress,
							leadName: matchedLead.fullName || `${matchedLead.firstName || ""} ${matchedLead.lastName || ""}`.trim(),
							properties,
							addPropertyUrl: "/sell"
						};
					},
				}),
				searchProperties: tool({
					description: "Search the real estate database for active properties matching the user's criteria.",
					inputSchema: z.object({
						city: z.string().optional().describe("City name only (e.g., Sanibel, Naples, Bonita Springs, Cape Coral)."),
						address: z.string().optional().describe("ONLY the street address (e.g. '622 Sw 52nd St')."),
						propertyType: z.string().optional().describe("Type of property (e.g., 'Single Family', 'Condo', 'Townhouse')"),
						community: z.string().optional().describe("Name of the community or subdivision"),
						subdivision: z.string().optional().describe("Name of the subdivision"),
						mlsNumber: z.string().optional().describe("MLS Number of the listing"),
						minPrice: z.coerce.number().optional().describe("Minimum price in dollars"),
						maxPrice: z.coerce.number().optional().describe("Maximum price in dollars"),
						beds: z.coerce.number().optional().describe("Minimum number of bedrooms"),
						baths: z.coerce.number().optional().describe("Minimum number of bathrooms"),
						hasPool: z.boolean().optional().describe("Whether the property must have a private pool"),
						waterfront: z.boolean().optional().describe("Whether the property must be waterfront"),
						gulfAccess: z.boolean().optional().describe("Whether the property must have gulf access"),
						newConstruction: z.boolean().optional().describe("Whether the property is new construction"),
						zipCode: z.string().optional().describe("Postal/Zip code"),
						garage: z.boolean().optional().describe("Whether the property must have a garage"),
						spa: z.boolean().optional().describe("Whether the property must have a spa"),
					}),
					execute: async (args) => {
						let { city, address, propertyType, community, subdivision, mlsNumber, minPrice, maxPrice, beds, baths, hasPool, waterfront, gulfAccess, newConstruction, zipCode, garage, spa } = args;

						const parseNumeric = (val: any) => {
							if (val === undefined || val === null) return undefined;
							const parsed = parseInt(String(val).replace(/[^\d.]/g, ""), 10);
							return isNaN(parsed) ? undefined : parsed;
						};

						const parsedBeds = parseNumeric(beds);
						const parsedBaths = parseNumeric(baths);
						const parsedMinPrice = parseNumeric(minPrice);
						const parsedMaxPrice = parseNumeric(maxPrice);

						const hasFilters = city || address || propertyType || community || subdivision || mlsNumber || zipCode || parsedBeds || parsedBaths || parsedMinPrice || parsedMaxPrice;
						if (!hasFilters && !hasPool && !waterfront && !gulfAccess && !newConstruction && !garage && !spa) {
							return [];
						}

						const isSpecificLookup = !!(address || mlsNumber);
						const where: any = isSpecificLookup ? {} : { StandardStatus: "Active" };

						const cleanLocation = (val: any): string | undefined => {
							if (!val || typeof val !== "string") return undefined;
							const cleaned = val
								.replace(/,\s*fl\b/gi, "")
								.replace(/,\s*florida\b/gi, "")
								.replace(/\bfl\b/gi, "")
								.replace(/\bflorida\b/gi, "")
								.replace(/\blocation\b/gi, "")
								.replace(/\barea\b/gi, "")
								.replace(/\bcity\b/gi, "")
								.replace(/[,;]/g, " ")
								.replace(/\s+/g, " ")
								.trim();
							return cleaned || undefined;
						};

						let finalCity = cleanLocation(city);
						let finalAddress = address ? address.trim() : undefined;

						if (finalAddress) {
							const addrLower = finalAddress.toLowerCase();
							const hasNumbers = /\d/.test(addrLower);
							const knownCities = ["naples", "bonita", "cape coral", "lehigh", "fort myers", "miami", "marco island", "estero", "sanibel", "punta gorda", "labelle", "babcock", "ave maria"];
							const matchesKnownCity = knownCities.some(c => {
								const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
								const regex = new RegExp(`\\b${escaped}\\b`, 'i');
								return regex.test(addrLower);
							});

							if (!hasNumbers || (matchesKnownCity && addrLower.split(" ").length <= 3)) {
								finalAddress = undefined;
							}
						}

						if (finalCity) {
							const cityUpper = finalCity.toUpperCase();
							if (cityUpper.includes("CAPE CORA")) {
								where.City = { contains: "CAPE CORAL" };
							} else if (cityUpper.includes("FT MYERS") || cityUpper.includes("FT. MYERS")) {
								where.City = { contains: "FORT MYERS" };
							} else {
								where.City = { contains: cityUpper };
							}
						}

						if (finalAddress) {
							const words = finalAddress.trim().split(' ').filter(Boolean);
							const houseNumber = words[0];
							const streetName = words.slice(1, 3).join(" ");

							if (houseNumber && /^\d+/.test(houseNumber)) {
								where.FullAddress = { startsWith: houseNumber };
								if (streetName) {
									const streetNameClean = streetName.replace(/\b(ave|ln|dr|rd|ct|st|pl|ter|cir)\b/gi, "").trim();
									if (streetNameClean) {
										where.AND = where.AND || [];
										where.AND.push({ FullAddress: { contains: streetNameClean } });
									}
								}
							} else {
								where.FullAddress = { contains: finalAddress };
							}
						}

						if (propertyType) {
							const pt = propertyType.toLowerCase();
							const genericTerms = ["buy", "purchase", "sale", "rent", "lease", "any", "properties", "real estate", "listing", "listings"];
							const isGeneric = genericTerms.some(term => pt === term || pt.includes(term));

							if (isGeneric) {
								if (pt.includes("rent") || pt.includes("lease")) {
									where.PropertyType = { contains: "Lease" };
								} else {
									where.PropertyType = { not: "Residential Lease" };
								}
							} else if (pt.includes('condo') || pt.includes('apartment')) {
								where.AND = where.AND || [];
								where.AND.push({
									OR: [
										{ PropertySubType: { contains: 'Rise' } },
										{ PropertySubType: { contains: 'Condo' } },
										{ PropertyType: { contains: 'Condo' } }
									]
								});
							} else if (pt.includes('single family') || pt.includes('home') || pt.includes('house')) {
								where.AND = where.AND || [];
								where.AND.push({
									OR: [
										{ PropertyType: { contains: 'Single Family' } },
										{ PropertySubType: { contains: 'Single Family' } }
									]
								});
							}
						}

						if (community) {
							where.AND = where.AND || [];
							where.AND.push({
								OR: [
									{ Community: { contains: community } },
									{ Development: { contains: community } }
								]
							});
						}

						if (subdivision) where.SubdivisionName = { contains: subdivision };
						if (mlsNumber) where.MLSNumber = { contains: mlsNumber.trim() };
						if (zipCode) where.PostalCode = zipCode;

						if (parsedMinPrice || parsedMaxPrice) {
							where.ListPrice = {};
							if (parsedMinPrice) where.ListPrice.gte = parsedMinPrice;
							if (parsedMaxPrice) where.ListPrice.lte = parsedMaxPrice;
						}
						if (parsedBeds) where.BedroomsTotal = { gte: parsedBeds };
						if (parsedBaths) where.BathroomsTotalInteger = { gte: parsedBaths };
						if (hasPool === true) where.PoolPrivateYN = true;
						if (waterfront === true) where.WaterfrontYN = true;
						if (gulfAccess === true) where.GulfAccessYN = true;
						if (newConstruction === true) where.NewConstructionYN = true;
						if (garage === true) where.GarageYN = true;
						if (spa === true) where.SpaYN = true;

						const selectFields = {
							id: true,
							FullAddress: true,
							ListPrice: true,
							BedroomsTotal: true,
							BathroomsTotalInteger: true,
							PoolPrivateYN: true,
							LivingArea: true,
							PropertyType: true,
							City: true,
							Community: true,
							MLSNumber: true,
							YearBuilt: true,
							Description: true,
							WaterfrontYN: true,
							GulfAccessYN: true,
							GarageYN: true,
							HOAFee: true,
							StandardStatus: true,
						};

						let properties = await prisma.property.findMany({
							where,
							take: 5, // Keep listing short for emails
							orderBy: { ListPrice: 'desc' },
							select: selectFields
						});

						if (properties.length === 0 && where.ListPrice) {
							const fallbackWhere = { ...where };
							delete fallbackWhere.ListPrice;

							const fallbackProperties = await prisma.property.findMany({
								where: fallbackWhere,
								take: 5,
								orderBy: { ListPrice: 'asc' },
								select: selectFields
							});

							if (fallbackProperties.length > 0) {
								properties = fallbackProperties;
							}
						}

						const hostUrl = process.env.NEXT_PUBLIC_SERVER_URL || "https://gulfshoregroup.com";
						return properties.map((p: any) => ({
							address: p.FullAddress,
							price: p.ListPrice ? `$${p.ListPrice.toLocaleString()}` : "Price TBD",
							beds: p.BedroomsTotal,
							baths: p.BathroomsTotalInteger,
							pool: p.PoolPrivateYN ? "Yes" : "No",
							sqft: p.LivingArea,
							type: p.PropertyType,
							yearBuilt: p.YearBuilt,
							description: p.Description ? `${p.Description.substring(0, 100)}...` : "",
							waterfront: p.WaterfrontYN ? "Yes" : "No",
							gulfAccess: p.GulfAccessYN ? "Yes" : "No",
							link: `${hostUrl}${UrlMaker(p.City || "", p.Community || "", p.FullAddress || "", p.MLSNumber || undefined)}`,
							status: p.StandardStatus,
						}));
					},
				}),
				scheduleTour: tool({
					description: "Schedule a property tour or viewing appointment. Use this when the user wants to see a property or meet with an agent.",
					inputSchema: z.object({
						name: z.string().describe("The visitor's full name"),
						email: z.string().optional().describe("The visitor's email address"),
						phone: z.string().optional().describe("The visitor's phone number"),
						preferredDate: z.string().optional().describe("Preferred date for the tour"),
						propertyAddress: z.string().optional().describe("The address of the property"),
						message: z.string().optional().describe("Any additional notes"),
					}),
					execute: async (args) => {
						const { name, email, phone, preferredDate, propertyAddress, message } = args;
						try {
							const leadEmail = email || `${phone?.replace(/[^0-9]/g, "") || Date.now()}@chatbot-lead.com`;
							let matchedLead = await prisma.lead.findFirst({
								where: {
									OR: [
										...(email ? [{ email }] : []),
										...(phone ? [{ phone }] : []),
									],
								},
							});

							if (!matchedLead) {
								const nameParts = name.split(" ");
								matchedLead = await prisma.lead.create({
									data: {
										firstName: nameParts[0] || name,
										lastName: nameParts.slice(1).join(" ") || undefined,
										fullName: name,
										email: leadEmail,
										phone: phone || undefined,
										source: "Tour_Request",
										score: 50,
										scoreLabel: "Hot",
									},
								});
							}

							await prisma.inquiry.create({
								data: {
									leadId: matchedLead.id,
									type: "Tour_Request",
									message: [
										`Tour Request from Inbound Email AI`,
										`Name: ${name}`,
										email ? `Email: ${email}` : null,
										phone ? `Phone: ${phone}` : null,
										preferredDate ? `Preferred Date: ${preferredDate}` : null,
										propertyAddress ? `Property: ${propertyAddress}` : null,
										message ? `Notes: ${message}` : null,
									].filter(Boolean).join("\n"),
								},
							});

							try {
								await sendAdminLeadAlertEmail({
									action: "inquiry",
									leadName: name,
									leadEmail: leadEmail,
									timestamp: new Date(),
									message: `🏠 Tour Request via Inbound Email AI\n\nName: ${name}\n${email ? `Email: ${email}\n` : ""}${phone ? `Phone: ${phone}\n` : ""}${preferredDate ? `Preferred Date: ${preferredDate}\n` : ""}${propertyAddress ? `Property: ${propertyAddress}\n` : ""}${message ? `Notes: ${message}` : ""}`,
								});
							} catch (emailErr) {
								console.error("Failed to send admin alert:", emailErr);
							}

							return {
								success: true,
								message: `Tour request booked successfully! Dimitri Schwarz will confirm. Preferred date: ${preferredDate || "Not specified"}.`,
							};
						} catch (err: any) {
							console.error("Schedule Tour Error:", err);
							return {
								success: false,
								message: "I apologize, there was an issue booking your tour. Please call Dimitri directly at 239.992.9119.",
							};
						}
					},
				}),
			}
		});

		// 4. Send the Email back to the user via Resend
		await resend.emails.send({
			from: process.env.RESEND_FROM_EMAIL || "Gulfshore Group <noreply@updates.gulfshoregroup.com>",
			to: cleanEmail,
			subject: `Re: ${subject}`,
			text: aiResponse,
		});

		// 5. Save AI's Reply to AI Chat History
		await prisma.aIChatHistory.create({
			data: {
				leadId: lead.id,
				channel: "email",
				role: "ai",
				message: aiResponse,
			}
		});

		// Recalculate lead score
		try {
			recalculateLeadScore(lead.id);
		} catch (err) {
			console.error("Scoring recalculation error:", err);
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("[EmailWebhookError]", error);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}

import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { generateText, tool } from "ai";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { Resend } from "resend";
import UrlMaker from "@/hooks/url-maker";
import { sendAdminLeadAlertEmail } from "@/lib/email/admin-lead-alert";
import { recalculateLeadScore } from "@/lib/leads/services/scoring.service";

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy");
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://gulfshoregroup.com";

// Helper to normalize location strings (strip state codes, filler words, etc.)
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

// Helper to extract the actual latest user email body (strip quoted email thread history)
const cleanEmailBody = (rawBody: string): string => {
	if (!rawBody) return "";
	let text = rawBody.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "\n");
	// Cut off thread reply headers
	const markers = [
		/On\s+.*wrote:/i,
		/From:\s+.*/i,
		/[\-\_]{3,}\s*Original Message\s*[\-\_]{3,}/i,
		/[\-\_]{3,}\s*Forwarded Message\s*[\-\_]{3,}/i,
	];
	for (const m of markers) {
		const index = text.search(m);
		if (index !== -1) {
			text = text.substring(0, index);
		}
	}
	return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
};

// Format plain text with URLs into styled HTML email for Gmail/Outlook
function formatTextToHtml(plainText: string): string {
	const escaped = plainText
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

	// Convert markdown links [text](url) to HTML <a href="url">text</a>
	const withMarkdownLinks = escaped.replace(
		/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
		'<a href="$2" target="_blank" style="color: #dc2626; font-weight: bold; text-decoration: underline;">$1</a>'
	);

	// Convert raw HTTP/HTTPS URLs into clickable links if not inside a tag
	const withRawLinks = withMarkdownLinks.replace(
		/(?<!href=")(https?:\/\/[^\s<]+)/g,
		'<a href="$1" target="_blank" style="color: #dc2626; font-weight: bold; text-decoration: underline;">$1</a>'
	);

	// Convert paragraphs
	const formattedParagraphs = withRawLinks
		.split("\n\n")
		.map((p) => `<p style="margin-bottom: 12px; line-height: 1.6;">${p.replace(/\n/g, "<br/>")}</p>`)
		.join("");

	return `
		<div style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1f2937; max-width: 620px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
			<div style="border-bottom: 2px solid #dc2626; padding-bottom: 12px; margin-bottom: 20px;">
				<h2 style="color: #dc2626; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">GULFSHORE GROUP</h2>
				<p style="color: #6b7280; font-size: 12px; margin: 4px 0 0 0; font-weight: 500;">Real Estate Concierge | Dimitri Schwarz</p>
			</div>
			<div style="font-size: 14px; color: #374151;">
				${formattedParagraphs}
			</div>
			<div style="border-top: 1px solid #e5e7eb; margin-top: 24px; padding-top: 14px; font-size: 12px; color: #9ca3af; text-align: center;">
				<p style="margin: 0;">© ${new Date().getFullYear()} Gulfshore Group Real Estate. All rights reserved.</p>
				<p style="margin: 4px 0 0 0;"><a href="${baseUrl}" style="color: #dc2626; text-decoration: none;">www.gulfshoregroup.com</a></p>
			</div>
		</div>
	`;
}

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();

		// Handle Resend inbound webhook schema (From, Subject, TextBody, etc.)
		const fromEmail = body.From || body.from || body.headers?.from;
		const textBody = body.TextBody || body.text || body.html || "";
		const subject = body.Subject || body.subject || "Real Estate Inquiry";

		// Extract clean email address if passed like "User Name <user@example.com>"
		let cleanFromEmail = fromEmail || "";
		const emailMatch = cleanFromEmail.match(/<([^>]+)>/);
		if (emailMatch && emailMatch[1]) {
			cleanFromEmail = emailMatch[1].trim();
		} else {
			cleanFromEmail = cleanFromEmail.trim();
		}

		if (!cleanFromEmail || !textBody) {
			return NextResponse.json({ error: "Missing required email or message body" }, { status: 400 });
		}

		// Extract ONLY the latest user message from the email (strip old thread history)
		const latestUserText = cleanEmailBody(textBody);
		console.log(`[Resend Webhook] Inbound email from ${cleanFromEmail}. Latest text: "${latestUserText}"`);

		// 1. Find or create lead by email
		let lead = await prisma.lead.findUnique({
			where: { email: cleanFromEmail }
		});

		if (!lead) {
			lead = await prisma.lead.create({
				data: {
					email: cleanFromEmail,
					source: "Other",
				}
			});
		}

		// 2. Save user message to AIChatHistory for email channel
		await prisma.aIChatHistory.create({
			data: {
				leadId: lead.id,
				channel: "email",
				role: "user",
				message: `Subject: ${subject}\n\n${latestUserText || textBody}`,
			}
		});

		// 3. Prepare messages context for AI (clean latest input + past context if relevant)
		const messages: any = [
			{
				role: "user",
				content: latestUserText || textBody,
			}
		];

		// Define AI Tools matching the website chat logic
		const tools = {
			// @ts-ignore
			searchProperties: tool({
				description: "Search the real estate database for active properties matching the lead's criteria (city, address, price, beds, baths, pool, waterfront, etc.). Use this whenever the lead asks to see homes, properties, or listings.",
				inputSchema: z.object({
					city: z.string().optional().describe("City name only (e.g., Sanibel, Naples, Bonita Springs, Cape Coral). DO NOT include state, 'FL', or 'location'."),
					address: z.string().optional().describe("ONLY the street address (e.g. '622 Sw 52nd St'). DO NOT include city, state, or zip code."),
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
					minAcres: z.coerce.number().optional().describe("Minimum lot size in acres"),
					maxAcres: z.coerce.number().optional().describe("Maximum lot size in acres"),
					minYearBuilt: z.coerce.number().optional().describe("Minimum year built"),
					maxYearBuilt: z.coerce.number().optional().describe("Maximum year built"),
					yearBuilt: z.coerce.number().optional().describe("Exact year built"),
					maxHoaFee: z.coerce.number().optional().describe("Maximum HOA fee per month"),
					keyword: z.string().optional().describe("A general keyword to search for."),
				}),
				// @ts-ignore
				execute: async (args: any) => {
					console.log("[Resend Webhook AI Tool] searchProperties called with args:", JSON.stringify(args));
					let { city, address, propertyType, community, subdivision, mlsNumber, minPrice, maxPrice, beds, baths, hasPool, waterfront, gulfAccess, newConstruction, zipCode, garage, spa, minAcres, maxAcres, minYearBuilt, maxYearBuilt, yearBuilt, maxHoaFee, keyword } = args;

					const parseNumeric = (val: any) => {
						if (val === undefined || val === null) return undefined;
						const parsed = parseInt(String(val).replace(/[^\d.]/g, ""), 10);
						return isNaN(parsed) ? undefined : parsed;
					};

					const parsedBeds = parseNumeric(beds);
					const parsedBaths = parseNumeric(baths);
					const parsedMinPrice = parseNumeric(minPrice);
					const parsedMaxPrice = parseNumeric(maxPrice);
					const parsedMinAcres = parseNumeric(minAcres);
					const parsedMaxAcres = parseNumeric(maxAcres);
					const parsedMinYear = parseNumeric(minYearBuilt);
					const parsedMaxYear = parseNumeric(maxYearBuilt);
					const parsedYear = parseNumeric(yearBuilt);
					const parsedMaxHoa = parseNumeric(maxHoaFee);

					const hasFilters = city || address || propertyType || community || subdivision || mlsNumber || zipCode || parsedBeds || parsedBaths || parsedMinPrice || parsedMaxPrice || keyword;
					if (!hasFilters && !hasPool && !waterfront && !gulfAccess && !newConstruction && !garage && !spa) {
						return [];
					}

					const isSpecificLookup = !!(address || mlsNumber);
					const where: any = isSpecificLookup ? {} : { StandardStatus: "Active" };

					let finalCity = cleanLocation(city);
					let finalAddress = address ? address.trim() : undefined;
					keyword = cleanLocation(keyword);
					community = cleanLocation(community);
					subdivision = cleanLocation(subdivision);

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
							keyword = keyword ? `${keyword} ${cleanLocation(finalAddress) || finalAddress}` : (cleanLocation(finalAddress) || finalAddress);
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
						const genericTerms = ["buy", "purchase", "sale", "rent", "lease", "any", "properties", "real estate", "listing", "listings", "both", "either"];
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
						} else if (pt.includes('townhouse') || pt.includes('villa') || pt.includes('land') || pt.includes('commercial')) {
							where.AND = where.AND || [];
							const dbType = pt.includes('townhouse') ? 'Townhouse' :
								pt.includes('villa') ? 'Villa' :
									pt.includes('land') || pt.includes('lot') ? 'Land' : 'Commercial';
							where.AND.push({
								OR: [
									{ PropertyType: { contains: dbType } },
									{ PropertySubType: { contains: dbType } }
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

					if (keyword) {
						const kw = keyword.trim();
						if (!finalCity || kw.toLowerCase() !== finalCity.toLowerCase()) {
							where.AND = where.AND || [];
							where.AND.push({
								OR: [
									{ City: { contains: kw } },
									{ FullAddress: { contains: kw } },
									{ Community: { contains: kw } },
									{ Development: { contains: kw } },
									{ SubdivisionName: { contains: kw } },
								]
							});
						}
					}

					if (parsedMinPrice || parsedMaxPrice) {
						where.ListPrice = {};
						if (parsedMinPrice) where.ListPrice.gte = parsedMinPrice;
						if (parsedMaxPrice) where.ListPrice.lte = parsedMaxPrice;
					}
					if (parsedBeds) where.BedroomsTotal = { gte: parsedBeds };
					if (parsedBaths) where.BathroomsTotalInteger = { gte: parsedBaths };
					if (parsedMinAcres || parsedMaxAcres) {
						where.LotSizeAcres = {};
						if (parsedMinAcres) where.LotSizeAcres.gte = parsedMinAcres;
						if (parsedMaxAcres) where.LotSizeAcres.lte = parsedMaxAcres;
					}
					if (parsedMinYear || parsedMaxYear || parsedYear) {
						where.YearBuilt = {};
						if (parsedMinYear) where.YearBuilt.gte = parsedMinYear;
						if (parsedMaxYear) where.YearBuilt.lte = parsedMaxYear;
						if (parsedYear) where.YearBuilt.equals = parsedYear;
					}
					if (parsedMaxHoa) where.HOAFee = { lte: parsedMaxHoa };
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
						LotSizeAcres: true,
						HOAFee: true,
						StandardStatus: true,
						GarageSpaces: true,
					};

					let properties = await prisma.property.findMany({
						where,
						take: 8,
						orderBy: { ListPrice: 'desc' },
						select: selectFields
					});

					// Fallback if strict price filter returned 0 results
					if (properties.length === 0 && where.ListPrice) {
						const fallbackWhere = { ...where };
						delete fallbackWhere.ListPrice;

						const fallbackProperties = await prisma.property.findMany({
							where: fallbackWhere,
							take: 8,
							orderBy: { ListPrice: 'asc' },
							select: selectFields
						});

						if (fallbackProperties.length > 0) {
							properties = fallbackProperties;
						}
					}

					console.log(`[Resend Webhook AI Tool] searchProperties found ${properties.length} properties.`);

					return properties.map((p: any) => {
						const relativeUrl = UrlMaker(p.City || "", p.Community || "", p.FullAddress || "", p.MLSNumber || undefined);
						const fullUrl = `${baseUrl}${relativeUrl}`;
						return {
							address: p.FullAddress,
							price: p.ListPrice ? `$${p.ListPrice.toLocaleString()}` : "Price TBD",
							beds: p.BedroomsTotal,
							baths: p.BathroomsTotalInteger,
							pool: p.PoolPrivateYN ? "Yes" : "No",
							sqft: p.LivingArea,
							type: p.PropertyType,
							yearBuilt: p.YearBuilt,
							waterfront: p.WaterfrontYN ? "Yes" : "No",
							gulfAccess: p.GulfAccessYN ? "Yes" : "No",
							garage: p.GarageYN ? "Yes" : "No",
							link: fullUrl,
						};
					});
				},
			}),
			// @ts-ignore
			checkSellerProperties: tool({
				description: "Look up a seller's existing property listings or home valuation requests by their email address, and provide link to list/value property on https://gulfshoregroup.com/sell.",
				inputSchema: z.object({
					email: z.string().optional().describe("The seller's email address to search"),
				}),
				// @ts-ignore
				execute: async (args: any) => {
					const targetEmail = args.email || cleanFromEmail;
					if (!targetEmail || !targetEmail.includes("@")) {
						return {
							found: false,
							email: targetEmail || "",
							message: "Please provide a valid email address.",
							addPropertyUrl: `${baseUrl}/sell`
						};
					}

					const leadLookupEmail = targetEmail.toLowerCase().trim();
					const targetLead = await prisma.lead.findUnique({
						where: { email: leadLookupEmail },
						include: {
							inquiryHistory: {
								orderBy: { createdAt: "desc" }
							}
						}
					});

					if (!targetLead || !targetLead.inquiryHistory || targetLead.inquiryHistory.length === 0) {
						return {
							found: false,
							email: leadLookupEmail,
							message: `No existing property listings or valuation requests were found for ${leadLookupEmail}.`,
							addPropertyUrl: `${baseUrl}/sell`
						};
					}

					const properties = targetLead.inquiryHistory.map((inq: any) => {
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
						email: leadLookupEmail,
						leadName: targetLead.fullName || `${targetLead.firstName || ""} ${targetLead.lastName || ""}`.trim(),
						properties,
						addPropertyUrl: `${baseUrl}/sell`
					};
				},
			}),
			// @ts-ignore
			scheduleTour: tool({
				description: "Schedule a property viewing, tour, home valuation consultation, or appointment.",
				inputSchema: z.object({
					name: z.string().describe("The lead's full name"),
					email: z.string().optional().describe("The lead's email address"),
					phone: z.string().optional().describe("The lead's phone number"),
					preferredDate: z.string().optional().describe("Preferred date for the viewing or appointment"),
					propertyAddress: z.string().optional().describe("The address of the property"),
					message: z.string().optional().describe("Any additional notes"),
				}),
				// @ts-ignore
				execute: async (args: any) => {
					const { name, email, phone, preferredDate, propertyAddress, message } = args;
					try {
						const leadEmail = email || cleanFromEmail;
						let tourLead = await prisma.lead.findFirst({
							where: {
								OR: [
									...(leadEmail ? [{ email: leadEmail }] : []),
									...(phone ? [{ phone }] : []),
								],
							},
						});

						if (!tourLead) {
							const nameParts = name.split(" ");
							tourLead = await prisma.lead.create({
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
								leadId: tourLead.id,
								type: "Tour_Request",
								message: [
									`Request via Email Webhook`,
									`Name: ${name}`,
									leadEmail ? `Email: ${leadEmail}` : null,
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
								message: `📧 Email Inquiry via Resend Webhook\n\nName: ${name}\nEmail: ${leadEmail}\n${phone ? `Phone: ${phone}\n` : ""}${propertyAddress ? `Property: ${propertyAddress}\n` : ""}${message ? `Notes: ${message}` : ""}`,
							});
						} catch (emailErr) {
							console.error("Failed to send admin alert:", emailErr);
						}

						return {
							success: true,
							message: `Request logged successfully! Dimitri Schwarz will follow up directly.`,
							leadId: tourLead.id,
						};
					} catch (err: any) {
						console.error("Schedule Tour Error:", err);
						return {
							success: false,
							message: "There was an issue processing your request.",
						};
					}
				},
			}),
		};

		// 4. Generate AI Email Response
		const { text } = await generateText({
			model: openai("gpt-4o-mini"),
			// @ts-ignore
			maxSteps: 5,
			system: `You are an expert AI Real Estate Concierge for Gulfshore Group, working on behalf of Dimitri Schwarz. 
You are replying to a lead via EMAIL. Write a professional, polite, well-structured, and detailed email response.

MANDATORY INSTRUCTION FOR SEARCHES & LOCATIONS:
- IF THE EMAIL CONTAINS A LOCATION (e.g. "naples", "sanibel", "fort myers", "cape coral", "bonita springs", "estero", "miami") OR ASKS FOR PROPERTIES/HOMES/LISTINGS:
- YOU MUST IMMEDIATELY CALL THE 'searchProperties' TOOL IN STEP 1 WITH THAT CITY (city: "Naples")!
- YOU ARE STRICTLY FORBIDDEN FROM RESPONDING WITH SHORT GENERIC PHRASES LIKE "Please let me know how I can assist you" OR "If you have any questions feel free to let me know"!
- YOU MUST LIST THE ACTUAL ACTIVE PROPERTIES FOUND BY THE TOOL IN YOUR EMAIL!

BUYER VS. SELLER INTENT DETECTION:

1. BUYER INTENT (Lead wants to BUY, RENT, or FIND listings):
- Call 'searchProperties' immediately with all extracted parameters (city, address, price, beds, baths, pool, propertyType).
- Format property results clearly in your email with bullet points:
  • Address - Price
    Bedrooms / Bathrooms | SqFt | Key Features (Pool, Waterfront)
    View Listing: [URL]

2. SELLER & PROPERTY LOOKUP WORKFLOW:
- If lead mentions wanting to sell a property or check their listed properties, call 'checkSellerProperties'.
- Include the link to list or value their property: ${baseUrl}/sell

3. BOTH BUY & SELL INTENT:
- Call 'searchProperties' for purchase criteria, AND offer seller valuation assistance with the ${baseUrl}/sell link.

EMAIL FORMATTING RULES:
- Write in a polite, professional, and warm tone.
- Format property links clearly as full URLs (e.g., https://gulfshoregroup.com/Florida-Real-Estate-Listings/...) so the recipient can click them in Gmail or Outlook.
- Always sign off as:
  Best regards,
  Dimitri Schwarz & AI Team
  Gulfshore Group Real Estate
  ${baseUrl}`,
			messages,
			tools,
		});

		console.log(`[Resend Webhook] AI generated text length: ${text.length} characters.`);

		// 5. Save AI response to AIChatHistory
		await prisma.aIChatHistory.create({
			data: {
				leadId: lead.id,
				channel: "email",
				role: "ai",
				message: text,
			}
		});

		// Recalculate lead score
		try {
			recalculateLeadScore(lead.id);
		} catch (scoreErr) {
			console.error("Scoring error:", scoreErr);
		}

		// 6. Generate styled HTML version of email for Gmail/Outlook clients
		const htmlContent = formatTextToHtml(text);

		// 7. Send the AI email reply back via Resend
		await resend.emails.send({
			from: process.env.RESEND_FROM_EMAIL || "Gulfshore Group <noreply@updates.gulfshoregroup.com>",
			to: cleanFromEmail,
			subject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
			text: text,
			html: htmlContent,
		});

		return NextResponse.json({ success: true, leadId: lead.id });
	} catch (error: any) {
		console.error("Resend Webhook Error:", error);
		return NextResponse.json({ error: error.message || "Webhook failed" }, { status: 500 });
	}
}

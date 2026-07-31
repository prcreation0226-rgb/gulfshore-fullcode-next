import { openai } from "@ai-sdk/openai";
import { streamText, tool, convertToModelMessages } from "ai";
import { z } from "zod";
import prisma from "@/lib/prisma";
import UrlMaker from "@/hooks/url-maker";
import { sendAdminLeadAlertEmail } from "@/lib/email/admin-lead-alert";

export const maxDuration = 60; // Allow up to 60 seconds

export async function POST(req: Request) {
	try {
		const { messages } = await req.json();

		const result = streamText({
			model: openai("gpt-4o-mini"),
			system: `You are an expert AI Real Estate Concierge for Gulfshore Group, working on behalf of Dimitri Schwarz. 
Your goal is to politely and professionally assist website visitors, answer their real estate questions, and qualify them as leads.
Key qualifying questions you should naturally weave into the conversation:
1. What is their budget?
2. What specific location or neighborhood are they looking at (e.g. Naples, Bonita Springs)?
3. Are they looking to buy, sell, or both?

Always be concise. Do not write long paragraphs. 
If the user asks for properties matching specific criteria, ALWAYS use the 'searchProperties' tool to fetch real, live data from the database. Do NOT make up properties.
If the search returns no properties, apologize and say you can set up a custom alert for them.

If the user wants to schedule a property tour, viewing, or appointment, use the 'scheduleTour' tool. Ask for their name, phone or email, and preferred date before calling the tool. After booking, confirm the appointment and tell them Dimitri will reach out to confirm.`,
			messages: await convertToModelMessages(messages),
			tools: {
				// @ts-ignore
				searchProperties: tool({
					description: "Search the real estate database for active properties matching the user's criteria. Use this whenever the user asks to see homes, properties, or listings.",
					parameters: z.object({
						city: z.string().optional().describe("City name, e.g., Naples, Bonita Springs"),
						minPrice: z.number().optional().describe("Minimum price in dollars"),
						maxPrice: z.number().optional().describe("Maximum price in dollars"),
						beds: z.number().optional().describe("Minimum number of bedrooms"),
						baths: z.number().optional().describe("Minimum number of bathrooms"),
						hasPool: z.boolean().optional().describe("Whether the property must have a private pool"),
					}),
					// @ts-ignore
					execute: async (args: any) => {
						const { city, minPrice, maxPrice, beds, baths, hasPool } = args;
						const where: any = { StandardStatus: "Active" };
						
						if (city) where.City = { contains: city };
						if (minPrice || maxPrice) {
							where.ListPrice = {};
							if (minPrice) where.ListPrice.gte = minPrice;
							if (maxPrice) where.ListPrice.lte = maxPrice;
						}
						if (beds) where.BedroomsTotal = { gte: beds };
						if (baths) where.BathroomsTotalInteger = { gte: baths };
						if (hasPool !== undefined) where.PoolPrivateYN = hasPool;

						const properties = await prisma.property.findMany({
							where,
							take: 5, // limit to 5 so we don't overwhelm the chat
							orderBy: { ListPrice: 'desc' },
							select: {
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
							}
						});

						return properties.map(p => ({
							address: p.FullAddress,
							price: p.ListPrice ? `$${p.ListPrice.toLocaleString()}` : "Price TBD",
							beds: p.BedroomsTotal,
							baths: p.BathroomsTotalInteger,
							pool: p.PoolPrivateYN ? "Yes" : "No",
							sqft: p.LivingArea,
							type: p.PropertyType,
							link: UrlMaker(p.City || "", p.Community || "", p.FullAddress || "", p.MLSNumber || undefined)
						}));
					},
				}),
				// @ts-ignore
				scheduleTour: tool({
					description: "Schedule a property tour or viewing appointment. Use this when the user wants to see a property, book a showing, or meet with an agent. Always ask for their name and contact info first.",
					parameters: z.object({
						name: z.string().describe("The visitor's full name"),
						email: z.string().optional().describe("The visitor's email address"),
						phone: z.string().optional().describe("The visitor's phone number"),
						preferredDate: z.string().optional().describe("Preferred date for the tour (e.g., '2024-12-20' or 'next Saturday')"),
						propertyAddress: z.string().optional().describe("The address of the property they want to tour"),
						message: z.string().optional().describe("Any additional notes or preferences"),
					}),
					// @ts-ignore
					execute: async (args: any) => {
						const { name, email, phone, preferredDate, propertyAddress, message } = args;

						try {
							// Find or create lead
							const leadEmail = email || `${phone?.replace(/[^0-9]/g, "") || Date.now()}@chatbot-lead.com`;
							let lead = await prisma.lead.findFirst({
								where: {
									OR: [
										...(email ? [{ email }] : []),
										...(phone ? [{ phone }] : []),
									],
								},
							});

							if (!lead) {
								const nameParts = name.split(" ");
								lead = await prisma.lead.create({
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

							// Create inquiry record
							await prisma.inquiry.create({
								data: {
									leadId: lead.id,
									type: "Tour_Request",
									message: [
										`Tour Request from AI Chatbot`,
										`Name: ${name}`,
										email ? `Email: ${email}` : null,
										phone ? `Phone: ${phone}` : null,
										preferredDate ? `Preferred Date: ${preferredDate}` : null,
										propertyAddress ? `Property: ${propertyAddress}` : null,
										message ? `Notes: ${message}` : null,
									].filter(Boolean).join("\n"),
								},
							});

							// Send admin alert email
							try {
								await sendAdminLeadAlertEmail({
									action: "inquiry",
									leadName: name,
									leadEmail: leadEmail,
									timestamp: new Date(),
									message: `🏠 Tour Request via AI Chatbot\n\nName: ${name}\n${email ? `Email: ${email}\n` : ""}${phone ? `Phone: ${phone}\n` : ""}${preferredDate ? `Preferred Date: ${preferredDate}\n` : ""}${propertyAddress ? `Property: ${propertyAddress}\n` : ""}${message ? `Notes: ${message}` : ""}`,
								});
							} catch (emailErr) {
								console.error("Failed to send admin alert:", emailErr);
							}

							return {
								success: true,
								message: `Tour request booked successfully! Dimitri Schwarz will reach out to ${name} to confirm the appointment.${preferredDate ? ` Preferred date: ${preferredDate}.` : ""}`,
								leadId: lead.id,
							};
						} catch (err: any) {
							console.error("Schedule Tour Error:", err);
							return {
								success: false,
								message: "I apologize, there was an issue booking your tour. Please call Dimitri directly at 239.992.9119 to schedule your viewing.",
							};
						}
					},
				}),
			},
		});

		return result.toUIMessageStreamResponse();
	} catch (error: any) {
		console.error("AI Chat Error:", error);
		return Response.json({ error: "Failed to generate AI response" }, { status: 500 });
	}
}

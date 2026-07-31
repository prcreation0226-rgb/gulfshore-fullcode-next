import { openai } from "@ai-sdk/openai";
import { streamText, tool, convertToModelMessages } from "ai";
import { z } from "zod";
import prisma from "@/lib/prisma";
import UrlMaker from "@/hooks/url-maker";
import { requireLead } from "@/lib/api/auth";

export const maxDuration = 60; // Allow up to 60 seconds

export async function POST(req: Request) {
	try {
		const { messages } = await req.json();
		const lead = await requireLead();

		// Save the user's incoming message to DB
		const lastUserMessage = messages[messages.length - 1];
		if (lastUserMessage && lastUserMessage.role === "user") {
			let messageText = "";
			
			if (typeof lastUserMessage.content === "string") {
				messageText = lastUserMessage.content;
			} else if (Array.isArray(lastUserMessage.content)) {
				// Sometimes content is an array of parts
				messageText = lastUserMessage.content.map((p: any) => p.text || "").join("");
			}
			
			if (!messageText && lastUserMessage.parts && Array.isArray(lastUserMessage.parts)) {
				messageText = lastUserMessage.parts.map((p: any) => p.text || "").join("");
			}
			
			await prisma.aIChatHistory.create({
				data: {
					leadId: lead.id,
					channel: "website",
					role: "user",
					message: messageText,
				}
			});
		}

		const result = streamText({
			model: openai("gpt-4o-mini"),
			system: `You are an expert AI Real Estate Concierge for Gulfshore Group, working on behalf of Dimitri Schwarz. 
Your goal is to politely and professionally assist website visitors, answer their real estate questions, and qualify them as leads.
Key qualifying questions you should naturally weave into the conversation:
1. What is their budget?
2. What specific location or neighborhood are they looking at (e.g. Naples, Bonita Springs)?
3. Are they looking to buy, sell, or both?

Always be concise. Do not write long paragraphs. 
If the user asks for properties matching specific criteria (like address, MLS number, city, beds, baths, price, property type, pool, waterfront, year built), ALWAYS use the 'searchProperties' tool to fetch real, live data from the database. Do NOT make up properties.
When you use the 'searchProperties' tool, it will return detailed property information including Description, YearBuilt, Lot Size, Waterfront, and more. Use this information to answer any specific questions the user has about a property (e.g., "when was this built?", "tell me about the description").
If they provide a specific address (e.g., "5100 Seagrass"), use the address parameter in the tool. ONLY include the street address in the address parameter, DO NOT include city, state, or zip code in the address parameter.
If the search returns no properties, apologize and say you can set up a custom alert for them.`,
			messages: await convertToModelMessages(messages),
			tools: {
				// @ts-ignore
				searchProperties: tool({
					description: "Search the real estate database for active properties matching the user's criteria. Use this whenever the user asks to see homes, properties, or listings.",
					parameters: z.object({
						city: z.string().optional().describe("City name, e.g., Naples, Bonita Springs, Cape Coral"),
						address: z.string().optional().describe("ONLY the street address (e.g. '622 Sw 52nd St'). DO NOT include city, state, or zip code."),
						propertyType: z.string().optional().describe("Type of property (e.g., 'Single Family', 'Condo', 'Townhouse')"),
						community: z.string().optional().describe("Name of the community or subdivision"),
						subdivision: z.string().optional().describe("Name of the subdivision"),
						mlsNumber: z.string().optional().describe("MLS Number of the listing"),
						minPrice: z.number().optional().describe("Minimum price in dollars"),
						maxPrice: z.number().optional().describe("Maximum price in dollars"),
						beds: z.number().optional().describe("Minimum number of bedrooms"),
						baths: z.number().optional().describe("Minimum number of bathrooms"),
						hasPool: z.boolean().optional().describe("Whether the property must have a private pool"),
						waterfront: z.boolean().optional().describe("Whether the property must be waterfront"),
						gulfAccess: z.boolean().optional().describe("Whether the property must have gulf access"),
						newConstruction: z.boolean().optional().describe("Whether the property is new construction"),
						zipCode: z.string().optional().describe("Postal/Zip code"),
						garage: z.boolean().optional().describe("Whether the property must have a garage"),
						spa: z.boolean().optional().describe("Whether the property must have a spa"),
						minAcres: z.number().optional().describe("Minimum lot size in acres"),
						maxAcres: z.number().optional().describe("Maximum lot size in acres"),
						minYearBuilt: z.number().optional().describe("Minimum year built"),
						maxYearBuilt: z.number().optional().describe("Maximum year built"),
						yearBuilt: z.number().optional().describe("Exact year built (e.g. 2025)"),
						maxHoaFee: z.number().optional().describe("Maximum HOA fee per month"),
					}),
					// @ts-ignore
					execute: async (args: any) => {
						const { city, address, propertyType, community, subdivision, mlsNumber, minPrice, maxPrice, beds, baths, hasPool, waterfront, gulfAccess, newConstruction, zipCode, garage, spa, minAcres, maxAcres, minYearBuilt, maxYearBuilt, yearBuilt, maxHoaFee } = args;
						
						// Prevent returning top 10 most expensive properties by default if no filters are provided
						const hasFilters = city || address || propertyType || community || subdivision || mlsNumber || zipCode || beds || baths || minPrice || maxPrice;
						if (!hasFilters && !hasPool && !waterfront && !gulfAccess && !newConstruction && !garage && !spa) {
							return [];
						}

						const where: any = { StandardStatus: "Active" };
						
						// Handle potential typos in city like "Cape Cora"
						if (city) {
							if (city.toLowerCase().includes("cape cora")) where.City = { contains: "Cape Coral" };
							else where.City = { contains: city };
						}
						if (address) {
							const words = address.replace(/[.,]/g, '').split(' ').filter(Boolean);
							if (words.length > 0) {
								where.AND = where.AND || [];
								words.forEach((w: string) => {
									where.AND.push({ FullAddress: { contains: w } });
								});
							}
						}
						if (propertyType) where.PropertyType = { contains: propertyType };
						if (community) where.Community = { contains: community };
						if (subdivision) where.SubdivisionName = { contains: subdivision };
						if (mlsNumber) where.MLSNumber = mlsNumber;
						if (zipCode) where.PostalCode = zipCode;
						if (minPrice || maxPrice) {
							where.ListPrice = {};
							if (minPrice) where.ListPrice.gte = minPrice;
							if (maxPrice) where.ListPrice.lte = maxPrice;
						}
						if (beds) where.BedroomsTotal = { gte: beds };
						if (baths) where.BathroomsTotalInteger = { gte: baths };
						if (minAcres || maxAcres) {
							where.LotSizeAcres = {};
							if (minAcres) where.LotSizeAcres.gte = minAcres;
							if (maxAcres) where.LotSizeAcres.lte = maxAcres;
						}
						if (minYearBuilt || maxYearBuilt || yearBuilt) {
							where.YearBuilt = {};
							if (minYearBuilt) where.YearBuilt.gte = minYearBuilt;
							if (maxYearBuilt) where.YearBuilt.lte = maxYearBuilt;
							if (yearBuilt) where.YearBuilt.equals = yearBuilt;
						}
						if (maxHoaFee) where.HOAFee = { lte: maxHoaFee };
						if (hasPool !== undefined) where.PoolPrivateYN = hasPool;
						if (waterfront !== undefined) where.WaterfrontYN = waterfront;
						if (gulfAccess !== undefined) where.GulfAccessYN = gulfAccess;
						if (newConstruction !== undefined) where.NewConstructionYN = newConstruction;
						if (garage !== undefined) where.GarageYN = garage;
						if (spa !== undefined) where.SpaYN = spa;

						const properties = await prisma.property.findMany({
							where,
							take: 10, // limit to 10 so we don't overwhelm the chat but still give good options
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
								YearBuilt: true,
								Description: true,
								WaterfrontYN: true,
								GulfAccessYN: true,
								GarageYN: true,
								LotSizeAcres: true,
								HOAFee: true,
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
							yearBuilt: p.YearBuilt,
							description: p.Description,
							waterfront: p.WaterfrontYN ? "Yes" : "No",
							gulfAccess: p.GulfAccessYN ? "Yes" : "No",
							garage: p.GarageYN ? "Yes" : "No",
							lotSizeAcres: p.LotSizeAcres,
							hoaFee: p.HOAFee,
							link: UrlMaker(p.City || "", p.Community || "", p.FullAddress || "", p.MLSNumber || undefined)
						}));
					},
				}),
			},
			onFinish: async ({ text, toolCalls, toolResults }) => {
				// Save the AI's response to the DB
				let finalMessage = text;
				
				// If the AI used a tool, we might want to append that context
				if (toolResults && toolResults.length > 0) {
					const result = toolResults[0] as any;
					if (result && result.result && Array.isArray(result.result) && result.result.length > 0) {
						finalMessage += `\n\n[Displayed ${result.result.length} properties]`;
					} else {
						finalMessage += `\n\n[Searched for properties but found none]`;
					}
				}

				if (finalMessage) {
					await prisma.aIChatHistory.create({
						data: {
							leadId: lead.id,
							channel: "website",
							role: "ai",
							message: finalMessage,
						}
					});
				}

				// Recalculate score asynchronously after the chat interaction
				import("@/lib/leads/services/scoring.service").then(({ recalculateLeadScore }) => {
					recalculateLeadScore(lead.id);
				});
			},
		});

		return result.toUIMessageStreamResponse();
	} catch (error: any) {
		console.error("AI Chat Error:", error);
		return Response.json({ error: "Failed to generate AI response" }, { status: 500 });
	}
}

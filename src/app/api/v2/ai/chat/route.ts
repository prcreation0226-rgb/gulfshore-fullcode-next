import { openai } from "@ai-sdk/openai";
import { streamText, tool, convertToModelMessages } from "ai";
import { z } from "zod";
import prisma from "@/lib/prisma";

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
If the search returns no properties, apologize and say you can set up a custom alert for them.`,
			messages: await convertToModelMessages(messages),
			tools: {
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
					execute: async ({ city, minPrice, maxPrice, beds, baths, hasPool }) => {
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
							link: `/properties/${p.id}` // Link to the property detail page
						}));
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

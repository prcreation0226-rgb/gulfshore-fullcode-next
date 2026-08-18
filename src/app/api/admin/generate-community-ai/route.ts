import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export const maxDuration = 300; // 5 minutes max duration for serverless functions

export async function POST(req: Request) {
	try {
		const { communityId, isGolfCommunity } = await req.json();

		if (!communityId) {
			return NextResponse.json({ error: "Community ID is required" }, { status: 400 });
		}

		// Update the golf community status in the DB
		const community = await prisma.community.update({
			where: { id: parseInt(communityId) },
			data: { isGolfCommunity: isGolfCommunity },
			include: { city: true }
		});

		if (!community) {
			return NextResponse.json({ error: "Community not found" }, { status: 404 });
		}

		// Prompt construction
		let systemPrompt = `You are an expert luxury real estate content writer for Gulfshore Group in Southwest Florida.
Your task is to write highly engaging, SEO-friendly content for ${community.name} located in ${community.city.name}, Florida.
Output your response as a valid JSON object with the following keys:
- "infoText": A concise, beautifully formatted HTML description of the community (approx 150-200 words maximum, do not make it too long). Use <h2>, <h3>, <p>, <ul>, and <li> tags. Make sure headings and important features are bolded and properly formatted. Include details about lifestyle, location, and amenities. Do not wrap in markdown code blocks.
- "title": An SEO-optimized meta title (max 60 characters).
- "metaDescription": An SEO-optimized meta description (max 160 characters).
- "keywords": A comma-separated list of highly relevant SEO keywords.`;

		if (isGolfCommunity) {
			systemPrompt += `\n\nCRITICAL INSTRUCTION: This is a Golf Community. In the "infoText", you must include details typical for this golf course (such as membership options, initiation fees, course designer, and club amenities) that you might find on naplesgolfguy.com or similar local directories. Be specific about the golf lifestyle in ${community.name}.`;
		} else {
			systemPrompt += `\n\nThis is a beautiful non-golf community. Focus on the natural beauty, waterfront access (if applicable), community amenities, and neighborhood charm in the "infoText".`;
		}

		const completion = await openai.createChatCompletion({
			model: "gpt-4o", // using gpt-4o for better reasoning and knowledge base
			messages: [
				{
					role: "system",
					content: systemPrompt
				},
				{
					role: "user",
					content: `Please generate the SEO data and HTML description for the community of ${community.name} in ${community.city.name}, FL.`
				}
			],
			temperature: 0.7,
		});

		const rawContent = completion.data.choices?.[0]?.message?.content || "{}";
		// Clean up markdown wrapping if the AI accidentally adds it
		const cleanJsonStr = rawContent.replace(/^```json/i, "").replace(/```$/i, "").trim();
		
		let parsedData;
		try {
			parsedData = JSON.parse(cleanJsonStr);
		} catch (e) {
			console.error("Failed to parse JSON from AI:", cleanJsonStr);
			return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
		}

		const descriptionPayload = JSON.stringify({
			infoText: parsedData.infoText || "",
			title: parsedData.title || "",
			metaDescription: parsedData.metaDescription || "",
			keywords: parsedData.keywords || ""
		});

		// Save the generated JSON to the community description
		const updatedCommunity = await prisma.community.update({
			where: { id: community.id },
			data: { description: descriptionPayload }
		});

		return NextResponse.json({ success: true, community: updatedCommunity, parsedData });
	} catch (error: any) {
		console.error("Error generating community AI description:", error);
		return NextResponse.json({ error: "Failed to generate AI description", details: error.message }, { status: 500 });
	}
}

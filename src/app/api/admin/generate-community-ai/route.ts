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
Your task is to write a highly engaging, SEO-friendly, and professional community description for ${community.name} located in ${community.city.name}, Florida.
Write it in HTML format. Use <h2>, <h3>, <p>, <ul>, and <li> tags. Do NOT wrap it in markdown code blocks.
Include details about the lifestyle, location benefits, nearby attractions, and why someone would want to live there.`;

		if (isGolfCommunity) {
			systemPrompt += `\n\nCRITICAL INSTRUCTION: This is a Golf Community. You must include details typical for this golf course (such as membership options, initiation fees, course designer, and club amenities) that you might find on naplesgolfguy.com or similar local directories. Be specific about the golf lifestyle in ${community.name}.`;
		} else {
			systemPrompt += `\n\nThis is a beautiful non-golf community. Focus on the natural beauty, waterfront access (if applicable), community amenities, and neighborhood charm.`;
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
					content: `Please write a comprehensive, beautiful HTML description for the community of ${community.name} in ${community.city.name}, FL.`
				}
			],
			temperature: 0.7,
		});

		const rawHtml = completion.data.choices?.[0]?.message?.content || "";
		// Clean up markdown wrapping if the AI accidentally adds it
		const cleanHtml = rawHtml.replace(/^```html/i, "").replace(/```$/i, "").trim();

		// Save the generated HTML to the community
		const updatedCommunity = await prisma.community.update({
			where: { id: community.id },
			data: { description: cleanHtml }
		});

		return NextResponse.json({ success: true, community: updatedCommunity });
	} catch (error: any) {
		console.error("Error generating community AI description:", error);
		return NextResponse.json({ error: "Failed to generate AI description", details: error.message }, { status: 500 });
	}
}

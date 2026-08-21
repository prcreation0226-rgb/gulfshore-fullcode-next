import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
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
		.map((p) => `<p style="margin-bottom: 14px; line-height: 1.6;">${p.replace(/\n/g, "<br/>")}</p>`)
		.join("");

	return `
		<div style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1f2937; max-width: 640px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
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
		console.log(`[Resend Webhook] Inbound email from ${cleanFromEmail}. Subject: "${subject}". Text: "${latestUserText}"`);

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

		// 3. Detect Location / City from Subject & Email Content
		const fullSearchStr = `${subject} ${latestUserText}`.toLowerCase();

		const knownCities = ["naples", "sanibel", "bonita springs", "bonita", "cape coral", "fort myers", "ft myers", "ft. myers", "estero", "marco island", "punta gorda", "lehigh", "miami", "ave maria"];
		let matchedCity: string | undefined = undefined;

		for (const city of knownCities) {
			if (fullSearchStr.includes(city)) {
				matchedCity = (city === "bonita") ? "BONITA SPRINGS" : (city.includes("ft") && city.includes("myers")) ? "FORT MYERS" : city.toUpperCase();
				break;
			}
		}

		// 4. Query Database for Active Properties if search intent/location detected
		let propertyContext = "";
		const isSearchQuery = matchedCity || fullSearchStr.includes("property") || fullSearchStr.includes("properties") || fullSearchStr.includes("home") || fullSearchStr.includes("house") || fullSearchStr.includes("buy") || fullSearchStr.includes("listing");

		if (isSearchQuery) {
			const targetCity = matchedCity || "NAPLES";
			console.log(`[Resend Webhook DB Query] Fetching active properties for city: ${targetCity}`);

			const properties = await prisma.property.findMany({
				where: {
					City: { contains: targetCity },
					StandardStatus: "Active"
				},
				take: 6,
				orderBy: { ListPrice: 'desc' },
				select: {
					FullAddress: true,
					ListPrice: true,
					BedroomsTotal: true,
					BathroomsTotalInteger: true,
					LivingArea: true,
					PropertyType: true,
					City: true,
					Community: true,
					MLSNumber: true,
					PoolPrivateYN: true,
					WaterfrontYN: true,
					GulfAccessYN: true,
				}
			});

			console.log(`[Resend Webhook DB Query] Found ${properties.length} active properties in ${targetCity}`);

			if (properties.length > 0) {
				propertyContext = `ACTIVE PROPERTIES IN ${targetCity} FROM DATABASE:\n\n` + properties.map((p: any, i: number) => {
					const relativeUrl = UrlMaker(p.City || "", p.Community || "", p.FullAddress || "", p.MLSNumber || undefined);
					const fullUrl = `${baseUrl}${relativeUrl}`;
					return `${i + 1}. ${p.FullAddress}
Price: $${p.ListPrice ? p.ListPrice.toLocaleString() : "Price TBD"}
Beds: ${p.BedroomsTotal ?? 0} | Baths: ${p.BathroomsTotalInteger ?? 0} | Living Area: ${p.LivingArea ? `${p.LivingArea.toLocaleString()} SqFt` : "N/A"}
Pool: ${p.PoolPrivateYN ? "Yes" : "No"} | Waterfront: ${p.WaterfrontYN ? "Yes" : "No"}${p.GulfAccessYN ? " | Gulf Access: Yes" : ""}
Listing Link: ${fullUrl}`;
				}).join("\n\n");
			}
		}

		// 5. Generate AI Email Response
		const { text } = await generateText({
			model: openai("gpt-4o-mini"),
			system: `You are an expert AI Real Estate Concierge for Gulfshore Group, working on behalf of Dimitri Schwarz. 
You are replying to a lead via EMAIL. Write a warm, professional, polite, well-structured, and helpful email response.

IMPORTANT RULES FOR PROPERTY SEARCH RESPONSES:
1. If DATABASE PROPERTY DATA is provided below, YOU MUST INCLUDE ALL THE PROPERTIES IN YOUR EMAIL REPLY!
2. For each property in the database list, format it clearly with:
   - Address and Price
   - Bedrooms, Bathrooms, Living Area (sqft), and Features (Pool, Waterfront, Gulf Access)
   - Direct Website Listing Link URL (e.g. View Listing: https://gulfshoregroup.com/Florida-Real-Estate-Listings/...)
3. DO NOT output short generic answers like "Please let me know how I can assist you" when property data is available!
4. Mention that Dimitri Schwarz is available for private viewings and offer assistance for both buying and selling homes. For selling or getting a free home valuation, provide the link: ${baseUrl}/sell
5. Always sign off as:
   Best regards,
   Dimitri Schwarz & AI Team
   Gulfshore Group Real Estate
   ${baseUrl}`,
			messages: [
				{
					role: "user",
					content: `Lead Email Query: "${latestUserText || textBody}"\n\n${propertyContext ? propertyContext : "No specific city properties found."}`,
				}
			]
		});

		console.log(`[Resend Webhook] AI generated email reply length: ${text.length} characters.`);

		// 6. Save AI response to AIChatHistory
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

		// 7. Generate styled HTML version of email for Gmail/Outlook clients
		const htmlContent = formatTextToHtml(text);

		// 8. Send the AI email reply back via Resend
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

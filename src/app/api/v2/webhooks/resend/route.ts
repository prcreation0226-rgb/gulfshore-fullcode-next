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

// Helper to extract the actual latest user email body (strip quoted email thread history & HTML safely)
const cleanEmailBody = (rawBody: string): string => {
	if (!rawBody || typeof rawBody !== "string") return "";

	let text = rawBody
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n\n")
		.replace(/<[^>]+>/g, "");

	const lines = text.split("\n");
	const cleanedLines: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (
			/^On\s+.*wrote:/i.test(trimmed) ||
			/^-----Original Message-----/i.test(trimmed) ||
			/^-----Forwarded Message-----/i.test(trimmed)
		) {
			break;
		}
		if (trimmed.startsWith(">")) {
			continue;
		}
		cleanedLines.push(line);
	}

	const result = cleanedLines.join("\n").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
	return result || rawBody.replace(/<[^>]+>/g, "").trim();
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
		console.log("[Resend Webhook Payload Received]:", JSON.stringify(body));

		// Support Resend SVIX inbound payload structure (body.data or root body)
		const payloadData = body.data || body;

		const fromEmail = payloadData.From || payloadData.from || payloadData.email || body.From || body.from || body.headers?.from;
		const textBody = payloadData.TextBody || payloadData.text || payloadData.html || body.TextBody || body.text || body.html || "";
		const rawSubject = payloadData.Subject || payloadData.subject || body.Subject || body.subject || "Real Estate Inquiry";

		// Robust Extraction of Message-ID for email threading (In-Reply-To / References)
		let messageId: string | undefined = undefined;

		if (payloadData.headers) {
			if (Array.isArray(payloadData.headers)) {
				const found = payloadData.headers.find((h: any) => h.name?.toLowerCase() === "message-id");
				if (found) messageId = found.value;
			} else if (typeof payloadData.headers === "object") {
				messageId = payloadData.headers["message-id"] || payloadData.headers["Message-ID"] || payloadData.headers["message_id"];
			}
		}

		if (!messageId) {
			messageId = payloadData.email_id || payloadData.id || body.email_id || body.id;
		}

		// Extract clean email address if passed like "User Name <user@example.com>"
		let cleanFromEmail = fromEmail || "";
		const emailMatch = cleanFromEmail.match(/<([^>]+)>/);
		if (emailMatch && emailMatch[1]) {
			cleanFromEmail = emailMatch[1].trim();
		} else {
			cleanFromEmail = cleanFromEmail.trim();
		}

		if (!cleanFromEmail) {
			return NextResponse.json({ error: "Missing sender email address" }, { status: 400 });
		}

		// Clean Subject line: Strip all "Re:" prefixes down to base subject so Gmail keeps replies inside the SAME thread!
		const trimmedSubject = (rawSubject || "Real Estate Inquiry").trim();
		const cleanSubject = trimmedSubject.replace(/^(re:\s*)+/gi, "").trim();
		const replySubject = `Re: ${cleanSubject || "Real Estate Inquiry"}`;

		// Extract ONLY the latest user message from the email (strip old thread history)
		const latestUserText = cleanEmailBody(textBody);
		console.log(`[Resend Webhook Processed] Sender: ${cleanFromEmail} | Clean Subject: "${cleanSubject}" | Reply Subject: "${replySubject}" | Latest Text: "${latestUserText}" | Msg ID: "${messageId}"`);

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
				message: `Subject: ${replySubject}\n\n${latestUserText || textBody}`,
			}
		});

		// 3. Detect Location / City from Subject & Email Content
		const fullSearchStr = `${rawSubject} ${latestUserText}`.toLowerCase();

		const knownCities = ["naples", "sanibel", "bonita springs", "bonita", "cape coral", "fort myers", "ft myers", "ft. myers", "estero", "marco island", "punta gorda", "lehigh", "miami", "ave maria"];
		let matchedCity: string | undefined = undefined;

		for (const city of knownCities) {
			if (fullSearchStr.includes(city)) {
				matchedCity = (city === "bonita") ? "BONITA SPRINGS" : (city.includes("ft") && city.includes("myers")) ? "FORT MYERS" : city.toUpperCase();
				break;
			}
		}

		// 4. Query Database for Active Properties (always default to NAPLES if no specific city was mentioned)
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

		let propertyContext = "";
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

		// 5. Generate AI Email Response
		const userQueryPrompt = latestUserText || textBody || "I am looking for properties to buy in Southwest Florida";

		let finalEmailText = "";
		try {
			const { text } = await generateText({
				model: openai("gpt-4o-mini"),
				system: `You are an expert AI Real Estate Concierge for Gulfshore Group, working on behalf of Dimitri Schwarz. 
You are replying to a lead via EMAIL inside an ongoing conversation thread. Write a warm, professional, polite, well-structured, and helpful email response.

CRITICAL INSTRUCTIONS FOR EMAIL REPLIES:
1. ALWAYS INCLUDE ALL THE ACTIVE PROPERTIES PROVIDED BELOW IN YOUR EMAIL RESPONSE!
2. For each property in the list, format it clearly with:
   - Address and Price
   - Bedrooms, Bathrooms, Living Area (sqft), and Features (Pool, Waterfront, Gulf Access)
   - Direct Website Listing Link URL (e.g. View Listing: https://gulfshoregroup.com/Florida-Real-Estate-Listings/...)
3. NEVER output generic 1-sentence responses like "How can I assist you today" or "It seems like there was a mistake".
4. Mention that Dimitri Schwarz is available for private viewings and offer assistance for both buying and selling homes. For selling or getting a free home valuation, provide the link: ${baseUrl}/sell
5. Always sign off as:
   Best regards,
   Dimitri Schwarz & AI Team
   Gulfshore Group Real Estate
   ${baseUrl}`,
				messages: [
					{
						role: "user",
						content: `Lead Email Message: "${userQueryPrompt}"\n\n${propertyContext}`,
					}
				]
			});
			finalEmailText = text;
		} catch (aiErr) {
			console.error("[Resend Webhook AI Error]:", aiErr);
		}

		// Strict Fallback: Guarantee property listings are included if AI outputs generic text or misses properties
		const lowerText = (finalEmailText || "").toLowerCase();
		const isGenericOrCutOff = !finalEmailText || 
			lowerText.includes("misunderstanding") || 
			lowerText.includes("assist you today") || 
			lowerText.includes("how may i assist") || 
			lowerText.includes("incomplete") || 
			!lowerText.includes("price:") || 
			finalEmailText.length < 200;

		if (propertyContext && isGenericOrCutOff) {
			finalEmailText = `Hello,

Thank you for reaching out to Gulfshore Group! Here are top active property listings currently available in ${targetCity}:

${propertyContext}

Dimitri Schwarz and our team are available for private viewings and full buyer representation. If you are also looking to sell your current home or get a free market valuation, please visit ${baseUrl}/sell.

Please let us know if you would like to schedule a showing or need further details on any of these homes.

Best regards,
Dimitri Schwarz & AI Team
Gulfshore Group Real Estate
${baseUrl}`;
		}

		console.log(`[Resend Webhook Success] Final email response length: ${finalEmailText.length} characters.`);

		// 6. Save AI response to AIChatHistory
		await prisma.aIChatHistory.create({
			data: {
				leadId: lead.id,
				channel: "email",
				role: "ai",
				message: finalEmailText,
			}
		});

		// Recalculate lead score
		try {
			recalculateLeadScore(lead.id);
		} catch (scoreErr) {
			console.error("Scoring error:", scoreErr);
		}

		// 7. Generate styled HTML version of email for Gmail/Outlook clients
		const htmlContent = formatTextToHtml(finalEmailText);

		// 8. Build email thread headers so Gmail stacks replies in the SAME thread
		const sendHeaders: Record<string, string> = {};
		if (messageId) {
			const formattedMsgId = messageId.startsWith("<") && messageId.endsWith(">") ? messageId : `<${messageId}>`;
			sendHeaders["In-Reply-To"] = formattedMsgId;
			sendHeaders["References"] = formattedMsgId;
		}

		// 9. Send the AI email reply back via Resend inside the SAME thread
		await resend.emails.send({
			from: process.env.RESEND_FROM_EMAIL || "Gulfshore Group <noreply@updates.gulfshoregroup.com>",
			to: cleanFromEmail,
			subject: replySubject,
			text: finalEmailText,
			html: htmlContent,
			headers: Object.keys(sendHeaders).length > 0 ? sendHeaders : undefined,
		});

		return NextResponse.json({ success: true, leadId: lead.id });
	} catch (error: any) {
		console.error("Resend Webhook Error:", error);
		return NextResponse.json({ error: error.message || "Webhook failed" }, { status: 500 });
	}
}

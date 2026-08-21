import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Resend } from "resend";
import UrlMaker from "@/hooks/url-maker";
import { sendAdminLeadAlertEmail } from "@/lib/email/admin-lead-alert";
import { recalculateLeadScore } from "@/lib/leads/services/scoring.service";

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy");
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://gulfshore-fullcode-next-production.up.railway.app";

// Helper to normalize location strings
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

// Helper to extract ONLY the new email message (completely strip quoted reply history)
const cleanEmailBody = (rawBody: string): string => {
	if (!rawBody || typeof rawBody !== "string") return "";

	// 1. Strip HTML tags and normalize spaces
	let text = rawBody
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n\n")
		.replace(/<[^>]+>/g, " ");

	// 2. Cut off everything starting from "On <Date> ... wrote:", "From:", "Sent:" or old AI text
	const cutOffPatterns = [
		/\bOn\s+[\s\S]*?wrote:/i,
		/\bOn\s+[\s\S]*?wrote\s*:/i,
		/-----Original Message-----/i,
		/-----Forwarded Message-----/i,
		/\bFrom:\s+[^\n]+<[^\n]+>/i,
		/\bSent:\s+[^\n]+/i,
		/It seems there was a misunderstanding/i,
		/It seems like your message/i,
		/It seems there's been a misunderstanding/i,
		/How can I assist you today/i,
	];

	for (const pattern of cutOffPatterns) {
		const match = text.match(pattern);
		if (match && match.index !== undefined) {
			text = text.substring(0, match.index);
		}
	}

	// 3. Filter out lines starting with '>' (quoted reply indicators)
	const lines = text.split("\n").filter((line) => !line.trim().startsWith(">"));
	const result = lines.join(" ").replace(/\s+/g, " ").trim();

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

export async function POST(req: Request) {
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
				messageId = payloadData.headers["message-id"] || payloadData.headers["Message-ID"] || payloadData.headers["message_id"] || payloadData.headers["Message-Id"];
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

		// Clean Subject line: Prepend "Re: " if not present, keep existing "Re: " if already present
		const trimmedSubject = (rawSubject || "Real Estate Inquiry").trim();
		const hasRe = /^re:\s*/i.test(trimmedSubject);
		const replySubject = hasRe ? trimmedSubject : `Re: ${trimmedSubject}`;

		// Extract ONLY the latest user message from the email (completely strip old thread history)
		const latestUserText = cleanEmailBody(textBody);
		console.log(`[Resend Webhook Processed] Sender: ${cleanFromEmail} | Clean Subject: "${trimmedSubject}" | Reply Subject: "${replySubject}" | Latest Text: "${latestUserText}" | Msg ID: "${messageId}"`);

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

		// 2. Save ONLY the new user message to AIChatHistory
		await prisma.aIChatHistory.create({
			data: {
				leadId: lead.id,
				channel: "email",
				role: "user",
				message: `Subject: ${replySubject}\n\n${latestUserText || textBody}`,
			}
		});

		// 3. Detect Location / City from Subject & Clean Email Content
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
			propertyContext = properties.map((p: any, i: number) => {
				const relativeUrl = UrlMaker(p.City || "", p.Community || "", p.FullAddress || "", p.MLSNumber || undefined);
				const fullUrl = `${baseUrl}${relativeUrl}`;
				return `${i + 1}. ${p.FullAddress}
Price: $${p.ListPrice ? p.ListPrice.toLocaleString() : "Price TBD"}
Beds: ${p.BedroomsTotal ?? 0} | Baths: ${p.BathroomsTotalInteger ?? 0} | Living Area: ${p.LivingArea ? `${p.LivingArea.toLocaleString()} SqFt` : "N/A"}
Pool: ${p.PoolPrivateYN ? "Yes" : "No"} | Waterfront: ${p.WaterfrontYN ? "Yes" : "No"}${p.GulfAccessYN ? " | Gulf Access: Yes" : ""}
Listing Link: ${fullUrl}`;
			}).join("\n\n");
		}

		// 5. Construct 100% Guaranteed Property Email Response
		let finalEmailText = "";

		if (properties.length > 0) {
			finalEmailText = `Hello,

Thank you for reaching out to Gulfshore Group! Here are top active property listings currently available in ${targetCity}:

${propertyContext}

Dimitri Schwarz and our team are available for private viewings and full buyer representation. If you are also looking to sell your current home or get a free market valuation, please visit ${baseUrl}/sell.

Please let us know if you would like to schedule a showing or need further details on any of these homes.

Best regards,
Dimitri Schwarz & AI Team
Gulfshore Group Real Estate
${baseUrl}`;
		} else {
			finalEmailText = `Hello,

Thank you for contacting Gulfshore Group Real Estate.

We specialize in luxury real estate across Southwest Florida, including Naples, Sanibel, Bonita Springs, Cape Coral, Fort Myers, and Estero.

Please visit our website at ${baseUrl} to browse all active listings, or let us know your preferred location, budget, and property criteria so we can send you custom matches.

Best regards,
Dimitri Schwarz & AI Team
Gulfshore Group Real Estate
${baseUrl}`;
		}

		console.log(`[Resend Webhook Success] Generated deterministic email response length: ${finalEmailText.length} characters.`);

		// 6. Save response to AIChatHistory
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

		// 9. Send the email reply back via Resend inside the SAME thread
		try {
			const sendResult = await resend.emails.send({
				from: process.env.RESEND_FROM_EMAIL || "Gulfshore Group <noreply@updates.gulfshoregroup.com>",
				to: cleanFromEmail,
				subject: replySubject,
				text: finalEmailText,
				html: htmlContent,
				headers: Object.keys(sendHeaders).length > 0 ? sendHeaders : undefined,
			});
			console.log("[Resend Email Sent Result]:", JSON.stringify(sendResult));
		} catch (sendErr) {
			console.error("[Resend Email Send Exception]:", sendErr);
		}

		return NextResponse.json({ success: true, leadId: lead.id });
	} catch (error: any) {
		console.error("Resend Webhook Error:", error);
		return NextResponse.json({ error: error.message || "Webhook failed" }, { status: 500 });
	}
}

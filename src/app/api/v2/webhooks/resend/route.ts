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

// Robust Helper to extract ONLY the user's latest email message (strip quoted thread history)
const cleanEmailBody = (rawBody: string): string => {
	if (!rawBody || typeof rawBody !== "string") return "";

	// 1. Strip HTML tags and convert <br>/<p> to line breaks
	let text = rawBody
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n\n")
		.replace(/<[^>]+>/g, "");

	const lines = text.split("\n");
	const userLines: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		// Stop as soon as we reach thread quote headers
		if (
			/^On\s+.*wrote:/i.test(trimmed) ||
			/^On\s+.*wrote\s*:/i.test(trimmed) ||
			/^-----Original Message-----/i.test(trimmed) ||
			/^From:\s+.*<.*>/i.test(trimmed) ||
			/^Sent:\s+/i.test(trimmed)
		) {
			break;
		}
		// Skip blockquote lines starting with '>'
		if (trimmed.startsWith(">")) {
			continue;
		}
		userLines.push(line);
	}

	const result = userLines.join(" ").replace(/\s+/g, " ").trim();
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

		// Clean Subject line for Gmail threading: Ensure a single "Re: " prefix
		const rawSub = (rawSubject || "Real Estate Inquiry").trim();
		const hasRe = /^re:\s*/i.test(rawSub);
		const replySubject = hasRe ? rawSub : `Re: ${rawSub}`;

		// Extract ONLY the latest user message from the email (completely strip old thread history)
		const latestUserText = cleanEmailBody(textBody);
		console.log(`[Resend Webhook Processed] Sender: ${cleanFromEmail} | Reply Subject: "${replySubject}" | Latest Text: "${latestUserText}" | Msg ID: "${messageId}"`);

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

		// 3. Detect Location / City & Intent (Buy, Sell, Both) from Subject & Email Content
		const fullSearchStr = `${rawSubject} ${latestUserText}`.toLowerCase();

		const knownCities = ["naples", "sanibel", "bonita springs", "bonita", "cape coral", "fort myers", "ft myers", "ft. myers", "estero", "marco island", "punta gorda", "lehigh", "miami", "ave maria"];
		let matchedCity: string | undefined = undefined;

		for (const city of knownCities) {
			if (fullSearchStr.includes(city)) {
				matchedCity = (city === "bonita") ? "BONITA SPRINGS" : (city.includes("ft") && city.includes("myers")) ? "FORT MYERS" : city.toUpperCase();
				break;
			}
		}

		const isSellIntent = fullSearchStr.includes("sell") || fullSearchStr.includes("selling") || fullSearchStr.includes("valuation") || fullSearchStr.includes("cma");
		const isBuyIntent = fullSearchStr.includes("buy") || fullSearchStr.includes("buying") || fullSearchStr.includes("property") || fullSearchStr.includes("properties") || fullSearchStr.includes("home") || fullSearchStr.includes("listing");

		let finalEmailText = "";

		// 4. Require explicit location before dumping properties, otherwise ask the user which city they want!
		if (matchedCity) {
			console.log(`[Resend Webhook DB Query] Location detected: ${matchedCity}. Fetching active properties...`);

			const properties = await prisma.property.findMany({
				where: {
					City: { contains: matchedCity },
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

			console.log(`[Resend Webhook DB Query] Found ${properties.length} active properties in ${matchedCity}`);

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
			} else {
				propertyContext = "No active listings currently matched this exact city search. Please contact us for custom off-market options.";
			}

			if (isSellIntent) {
				// BOTH BUY AND SELL WITH LOCATION
				finalEmailText = `Hello,

Thank you for contacting Gulfshore Group Real Estate! We are delighted to assist you with both buying in ${matchedCity} and selling your current property.

1. BUYING - Active Property Matches in ${matchedCity}:
${propertyContext}

2. SELLING - Free Home Valuation & Listing Service:
If you are looking to sell your home, Dimitri Schwarz offers expert marketing and complimentary market evaluations. You can list your property or request a valuation here:
${baseUrl}/sell

Please reply with any specific criteria (price range, bedrooms, waterfront, pool) or your property address for sale so we can assist you right away!

Best regards,
Dimitri Schwarz & AI Team
Gulfshore Group Real Estate
${baseUrl}`;
			} else {
				// PURE BUYING WITH LOCATION
				finalEmailText = `Hello,

Thank you for reaching out to Gulfshore Group! Here are top active property listings currently available in ${matchedCity}:

${propertyContext}

Dimitri Schwarz and our team are available for private viewings and full buyer representation. If you are also looking to sell your current home or get a free market valuation, please visit ${baseUrl}/sell.

Please let us know if you would like to schedule a showing or need further details on any of these homes.

Best regards,
Dimitri Schwarz & AI Team
Gulfshore Group Real Estate
${baseUrl}`;
			}
		} else if (isBuyIntent) {
			// User wants to BUY properties, but did NOT specify a location/city!
			// Ask the user which location they want!
			finalEmailText = `Hello,

Thank you for reaching out to Gulfshore Group Real Estate!

We would love to send you matching active property listings. Which location or city in Southwest Florida are you looking to buy in?

Our primary active market coverage includes:
- Naples
- Sanibel
- Cape Coral
- Fort Myers
- Bonita Springs
- Estero
- Marco Island

Please reply with your preferred location, budget, or bedroom count, and I will immediately send you matching active property listings with direct links!

Best regards,
Dimitri Schwarz & AI Team
Gulfshore Group Real Estate
${baseUrl}`;
		} else if (isSellIntent) {
			// User wants to SELL a property
			finalEmailText = `Hello,

Thank you for reaching out to Gulfshore Group Real Estate!

Dimitri Schwarz provides complimentary, high-precision Home Valuations (Comparative Market Analysis) and full listing representation across Southwest Florida.

To list your property for sale or get a free home market valuation immediately, please visit our seller portal:
${baseUrl}/sell

Please reply with your property address and details if you would like Dimitri to prepare a custom Home Valuation for you.

Best regards,
Dimitri Schwarz & AI Team
Gulfshore Group Real Estate
${baseUrl}`;
		} else {
			// General Greeting or Inquiry
			finalEmailText = `Hello,

Thank you for contacting Gulfshore Group Real Estate!

I am your AI Real Estate Concierge, working on behalf of Dimitri Schwarz. How can I assist you with your real estate needs today?

Are you looking to:
1. Buy or rent a property in Southwest Florida (Naples, Sanibel, Cape Coral, Fort Myers, Bonita Springs, Estero)?
2. Sell your home or request a free Comparative Market Analysis (CMA)? Visit ${baseUrl}/sell
3. Schedule a private property viewing?

Please reply with your preferred location, budget, or criteria so we can send you matching active listings!

Best regards,
Dimitri Schwarz & AI Team
Gulfshore Group Real Estate
${baseUrl}`;
		}

		console.log(`[Resend Webhook Success] Generated email response length: ${finalEmailText.length} characters.`);

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

		// 8. Build email thread headers so Gmail stacks replies in the SAME thread (Only if valid RFC Message-ID containing @)
		const sendHeaders: Record<string, string> = {};
		if (messageId && messageId.includes("@")) {
			const formattedMsgId = messageId.startsWith("<") && messageId.endsWith(">") ? messageId : `<${messageId}>`;
			sendHeaders["In-Reply-To"] = formattedMsgId;
			sendHeaders["References"] = formattedMsgId;
		}

		// 9. Send the email reply back via Resend inside the SAME thread
		let result: any;
		try {
			result = await resend.emails.send({
				from: process.env.RESEND_FROM_EMAIL || "Gulfshore Group <noreply@updates.gulfshoregroup.com>",
				to: cleanFromEmail,
				subject: replySubject,
				text: finalEmailText,
				html: htmlContent,
				headers: Object.keys(sendHeaders).length > 0 ? sendHeaders : undefined,
			});
			console.log("[Resend Email Sent Result]:", JSON.stringify(result));
		} catch (sendErr) {
			console.error("[Resend Email Send Exception]:", sendErr);
		}

		if (result?.data?.id) {
			try {
				await prisma.communicationLog.create({
					data: {
						type: "Email",
						to: cleanFromEmail,
						subject: replySubject,
						status: "sent",
						providerId: result.data.id,
					},
				});
			} catch (logErr) {
				console.error("Failed to log AI auto reply:", logErr);
			}
		}

		return NextResponse.json({ success: true, leadId: lead.id });
	} catch (error: any) {
		console.error("Resend Webhook Error:", error);
		return NextResponse.json({ error: error.message || "Webhook failed" }, { status: 500 });
	}
}

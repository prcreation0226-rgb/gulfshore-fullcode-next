import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Resend } from "resend";
import UrlMaker from "@/hooks/url-maker";
import { sendAdminLeadAlertEmail } from "@/lib/email/admin-lead-alert";
import { recalculateLeadScore } from "@/lib/leads/services/scoring.service";

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy");
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://gulfshore-fullcode-next-production.up.railway.app";

// Helper to extract best cover image URL for property cards
function getPropertyImageUrl(p: any): string {
	if (p.media && Array.isArray(p.media) && p.media.length > 0 && p.media[0]?.MediaURL) {
		return p.media[0].MediaURL;
	}
	if (p.images) {
		if (Array.isArray(p.images) && p.images.length > 0) {
			const first = p.images[0];
			if (typeof first === "string") return first;
			if (typeof first === "object" && first?.MediaURL) return first.MediaURL;
		}
	}
	// High-resolution luxury real estate fallback photo
	return "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80";
}

// 100% Robust Helper to extract ONLY the user's fresh message (never erase user text)
const cleanEmailBody = (rawBody: string): string => {
	if (!rawBody || typeof rawBody !== "string") return "";

	let text = rawBody;

	// 1. If HTML, extract text before the quote section ("On ... wrote:" or "gmail_quote")
	const quoteCutoffMatch = text.match(/(?:<div[^>]*class=["'][^"']*gmail_quote[^"']*["']|On\s+[\s\S]*?wrote\s*:|-----Original Message-----)/i);
	if (quoteCutoffMatch && quoteCutoffMatch.index !== undefined && quoteCutoffMatch.index > 0) {
		text = text.substring(0, quoteCutoffMatch.index);
	}

	// 2. Strip HTML tags
	text = text
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
		.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n\n")
		.replace(/<[^>]+>/g, " ");

	// 3. Clean up whitespace
	const lines = text.split("\n")
		.map(l => l.trim())
		.filter(l => l.length > 0 && !l.startsWith(">"));

	let result = lines.join(" ").replace(/\s+/g, " ").trim();

	// 4. FALLBACK: If stripping resulted in empty string, use rawBody with HTML stripped!
	if (!result) {
		result = rawBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
	}

	return result;
};

interface ExtractedSearch {
	location?: string;
	maxPrice?: number;
	minPrice?: number;
	beds?: number;
	baths?: number;
	poolOnly?: boolean;
	waterfrontOnly?: boolean;
}

// Extract search parameters strictly from the user's fresh email message
function extractSearchParamsFromUserText(text: string): ExtractedSearch {
	const result: ExtractedSearch = {};
	if (!text || typeof text !== "string") return result;

	const clean = text.toLowerCase().trim();

	// 1. Location / City extraction
	const knownCities = [
		{ key: "sanibel", name: "Sanibel" },
		{ key: "bonita springs", name: "Bonita Springs" },
		{ key: "bonita", name: "Bonita Springs" },
		{ key: "cape coral", name: "Cape Coral" },
		{ key: "fort myers", name: "Fort Myers" },
		{ key: "ft myers", name: "Fort Myers" },
		{ key: "ft. myers", name: "Fort Myers" },
		{ key: "estero", name: "Estero" },
		{ key: "marco island", name: "Marco Island" },
		{ key: "punta gorda", name: "Punta Gorda" },
		{ key: "lehigh", name: "Lehigh Acres" },
		{ key: "miami", name: "Miami" },
		{ key: "ave maria", name: "Ave Maria" },
		{ key: "naples", name: "Naples" },
	];

	for (const item of knownCities) {
		if (clean.includes(item.key)) {
			result.location = item.name;
			break;
		}
	}

	// 2. Max Price extraction ($500k, $1m, 500000, under 1M)
	const priceKMatch = clean.match(/(?:under|below|max|up to|\$)\s*(\d+(?:\.\d+)?)\s*k\b/i);
	if (priceKMatch && priceKMatch[1]) {
		result.maxPrice = parseFloat(priceKMatch[1]) * 1000;
	} else {
		const priceMMatch = clean.match(/(?:under|below|max|up to|\$)\s*(\d+(?:\.\d+)?)\s*m\b/i);
		if (priceMMatch && priceMMatch[1]) {
			result.maxPrice = parseFloat(priceMMatch[1]) * 1000000;
		} else {
			const priceRawMatch = clean.match(/(?:under|below|max|price)\s*\$?(\d[\d,]{3,})/i);
			if (priceRawMatch && priceRawMatch[1]) {
				result.maxPrice = parseInt(priceRawMatch[1].replace(/,/g, ""), 10);
			}
		}
	}

	// 3. Bedrooms extraction (1 bed, 2 beds, 3 bedrooms, 4 bed)
	const bedMatch = clean.match(/(\d+)\s*(?:bed|beds|bedroom|bedrooms)\b/i);
	if (bedMatch && bedMatch[1]) {
		result.beds = parseInt(bedMatch[1], 10);
	}

	// 4. Bathrooms extraction (1 bath, 2 baths, 3 bathrooms)
	const bathMatch = clean.match(/(\d+)\s*(?:bath|baths|bathroom|bathrooms)\b/i);
	if (bathMatch && bathMatch[1]) {
		result.baths = parseInt(bathMatch[1], 10);
	}

	// 5. Pool / Waterfront extraction
	if (clean.includes("pool")) result.poolOnly = true;
	if (clean.includes("waterfront") || clean.includes("gulf access")) result.waterfrontOnly = true;

	return result;
}

// Builder for High-End Luxury Property Email Template (Matches User Reference Image)
function buildHtmlPropertyEmail(
	matchedLocation: string,
	properties: any[],
	introTitle: string = "HOMES MATCHING YOUR SEARCH",
	subtitle: string = "We found matching active properties for your criteria."
): string {
	const propertyCardsHtml = properties.map((p: any) => {
		const relativeUrl = UrlMaker(p.City || "", p.Community || "", p.FullAddress || "", p.MLSNumber || undefined);
		const fullUrl = `${baseUrl}${relativeUrl}`;
		const imgUrl = getPropertyImageUrl(p);
		const formattedPrice = p.ListPrice ? `$${p.ListPrice.toLocaleString()}` : "Price Upon Request";
		const beds = p.BedroomsTotal ?? 0;
		const baths = p.BathroomsTotalInteger ?? 0;
		const sqft = p.LivingArea ? `${p.LivingArea.toLocaleString()} sqft` : "N/A";
		const poolText = p.PoolPrivateYN ? "Private Pool" : p.WaterfrontYN ? "Waterfront" : "Luxury Residence";
		const officeName = p.ListOfficeName || "Gulfshore Group Real Estate";

		return `
		<!-- PROPERTY CARD -->
		<div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
			<!-- COVER IMAGE -->
			<div style="width: 100%; height: 220px; background-color: #f3f4f6; overflow: hidden;">
				<a href="${fullUrl}" target="_blank" style="text-decoration: none;">
					<img src="${imgUrl}" alt="${p.FullAddress}" style="width: 100%; height: 220px; object-fit: cover; border: 0; display: block;" />
				</a>
			</div>

			<!-- CARD BODY -->
			<div style="padding: 18px 20px;">
				<!-- ACTIVE BADGE -->
				<div style="margin-bottom: 8px;">
					<span style="background-color: #16a34a; color: #ffffff; font-size: 10px; font-weight: 800; padding: 4px 8px; border-radius: 4px; letter-spacing: 0.5px; text-transform: uppercase;">ACTIVE</span>
				</div>

				<!-- PRICE -->
				<div style="font-size: 26px; font-weight: 800; color: #111827; margin: 4px 0 2px 0; letter-spacing: -0.5px;">
					${formattedPrice}
				</div>

				<!-- ADDRESS -->
				<div style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 4px;">
					${p.FullAddress}, ${p.City}, FL ${p.PostalCode || ""}
				</div>

				<!-- SUBTYPE / COMMUNITY -->
				<div style="font-size: 11px; font-weight: 700; color: #b45309; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
					${(p.PropertyType || "SINGLE FAMILY").toUpperCase()} ${p.Community ? `• ${p.Community.toUpperCase()}` : ""}
				</div>

				<!-- SPECS GRID -->
				<div style="border-top: 1px solid #f3f4f6; border-bottom: 1px solid #f3f4f6; padding: 10px 0; margin-bottom: 14px;">
					<table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 13px; color: #4b5563; text-align: center;">
						<tr>
							<td width="25%" style="border-right: 1px solid #f3f4f6;"><strong>${beds}</strong> Beds</td>
							<td width="25%" style="border-right: 1px solid #f3f4f6;"><strong>${baths}</strong> Baths</td>
							<td width="25%" style="border-right: 1px solid #f3f4f6;"><strong>${sqft}</strong></td>
							<td width="25%"><strong>${poolText}</strong></td>
						</tr>
					</table>
				</div>

				<!-- LISTING OFFICE -->
				<div style="font-size: 11px; color: #9ca3af; margin-bottom: 14px;">
					Source: MLS Listing • Listing Office: ${officeName}
				</div>

				<!-- RED VIEW DETAILS BUTTON -->
				<a href="${fullUrl}" target="_blank" style="display: block; width: 100%; background-color: #dc2626; color: #ffffff; text-align: center; padding: 13px 0; border-radius: 6px; font-size: 14px; font-weight: 700; text-decoration: none; box-sizing: border-box;">
					VIEW DETAILS
				</a>
			</div>
		</div>
		`;
	}).join("");

	return `
	<!DOCTYPE html>
	<html>
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
	</head>
	<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: Arial, Helvetica, sans-serif; -webkit-font-smoothing: antialiased;">
		<div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);">
			
			<!-- HEADER LOGO BAR -->
			<div style="padding: 24px 24px 16px 24px; border-bottom: 2px solid #dc2626; background-color: #ffffff; text-align: center;">
				<h1 style="margin: 0; color: #dc2626; font-size: 24px; font-weight: 900; letter-spacing: -0.5px;">GULFSHORE GROUP</h1>
				<p style="margin: 4px 0 0 0; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Real Estate Concierge | Dimitri Schwarz</p>
			</div>

			<!-- INTRO SECTION -->
			<div style="padding: 24px 24px 12px 24px; text-align: center; background-color: #ffffff;">
				<h2 style="margin: 0 0 8px 0; color: #111827; font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">${introTitle} IN ${matchedLocation.toUpperCase()}</h2>
				<p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.5;">${subtitle}</p>
				<div style="width: 60px; height: 3px; background-color: #d97706; margin: 16px auto 0 auto; border-radius: 2px;"></div>
			</div>

			<!-- CARDS CONTAINER -->
			<div style="padding: 16px 24px 24px 24px; background-color: #f9fafb;">
				${properties.length > 0 ? propertyCardsHtml : `
				<div style="background-color: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e5e7eb; text-align: center; margin-bottom: 20px;">
					<p style="font-size: 15px; color: #374151; font-weight: 600; margin-bottom: 8px;">No active properties found matching your exact search criteria in ${matchedLocation.toUpperCase()}.</p>
					<p style="font-size: 13px; color: #6b7280; line-height: 1.5; margin-bottom: 16px;">Gulfshore Group specializes exclusively in Southwest Florida real estate (Naples, Bonita Springs, Cape Coral, Fort Myers, Estero, Marco Island, Sanibel, etc.).</p>
					<a href="${baseUrl}" style="display: inline-block; background-color: #dc2626; color: #ffffff; padding: 10px 20px; border-radius: 6px; font-weight: bold; text-decoration: none; font-size: 13px;">BROWSE ALL LISTINGS</a>
				</div>
				`}
			</div>

			<!-- FOOTER -->
			<div style="padding: 20px 24px; background-color: #ffffff; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
				<p style="margin: 0 0 8px 0; font-weight: 600;">Dimitri Schwarz & AI Concierge Team • Gulfshore Group Real Estate</p>
				<p style="margin: 0 0 8px 0;">Looking to sell your home or get a free valuation? <a href="${baseUrl}/sell" style="color: #dc2626; font-weight: bold; text-decoration: underline;">Visit Seller Portal</a></p>
				<p style="margin: 0; color: #9ca3af;">© ${new Date().getFullYear()} Gulfshore Group. All rights reserved. <a href="${baseUrl}" style="color: #dc2626; text-decoration: none;">www.gulfshoregroup.com</a></p>
			</div>

		</div>
	</body>
	</html>
	`;
}

// HTML Template for Simple AI Concierge Greeting Response (When user sends "hi" / "hello")
function buildHtmlGreetingEmail(): string {
	return `
	<!DOCTYPE html>
	<html>
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
	</head>
	<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: Arial, Helvetica, sans-serif;">
		<div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);">
			
			<div style="padding: 24px; border-bottom: 2px solid #dc2626; text-align: center;">
				<h1 style="margin: 0; color: #dc2626; font-size: 24px; font-weight: 900;">GULFSHORE GROUP</h1>
				<p style="margin: 4px 0 0 0; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase;">Real Estate Concierge | Dimitri Schwarz</p>
			</div>

			<div style="padding: 28px 24px; color: #374151; font-size: 15px; line-height: 1.6;">
				<p style="margin-top: 0;">Hello,</p>
				<p>Thank you for reaching out to <strong>Gulfshore Group Real Estate</strong>! I am Dimitri Schwarz's AI Real Estate Concierge.</p>
				<p>To help us find the perfect properties or assist you immediately, please let me know:</p>
				<ol style="padding-left: 20px; margin-bottom: 24px; line-height: 1.8;">
					<li><strong>Location:</strong> Which city or community in Southwest Florida are you interested in? <em>(e.g., Naples, Sanibel, Cape Coral, Fort Myers, Bonita Springs, Estero, Marco Island)</em></li>
					<li><strong>Budget / Price Range:</strong> What is your target price range or max budget?</li>
					<li><strong>Intent:</strong> Are you looking to <strong>Buy</strong>, <strong>Sell</strong>, or <strong>Both</strong>?</li>
				</ol>
				<p style="margin-bottom: 0;">Simply reply to this email with your criteria, and I will instantly present matching active luxury listings for you!</p>
			</div>

			<div style="padding: 20px 24px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
				<p style="margin: 0 0 8px 0; font-weight: 600;">Dimitri Schwarz & AI Concierge Team • Gulfshore Group Real Estate</p>
				<p style="margin: 0;">Looking to sell your home? <a href="${baseUrl}/sell" style="color: #dc2626; font-weight: bold;">Visit Seller Portal</a></p>
			</div>

		</div>
	</body>
	</html>
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

		// Extract Message-ID for email threading
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

		// Extract clean email address
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

		// Extract ONLY the latest fresh user message from the email
		const latestUserText = cleanEmailBody(textBody);
		const fullTextLower = (latestUserText || textBody).toLowerCase().trim();

		console.log(`[Resend Webhook Processed] Sender: ${cleanFromEmail} | Reply Subject: "${replySubject}" | Latest Fresh Text: "${latestUserText}"`);

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

		// 3. Extract Search Parameters (Location, Price, Beds, Baths, Pool)
		let searchParams = extractSearchParamsFromUserText(latestUserText);
		if (!searchParams.location) {
			const fallbackParams = extractSearchParamsFromUserText(textBody);
			if (fallbackParams.location) {
				searchParams.location = fallbackParams.location;
			}
		}

		const isSellIntent = fullTextLower.includes("sell") || fullTextLower.includes("selling") || fullTextLower.includes("valuation") || fullTextLower.includes("cma");
		const isBuyIntent = fullTextLower.includes("buy") || fullTextLower.includes("buying") || fullTextLower.includes("property") || fullTextLower.includes("properties") || fullTextLower.includes("home") || fullTextLower.includes("listing") || searchParams.location !== undefined;

		// 4. RULE: SIMPLE GREETING WITHOUT SEARCH DETAILS ("hi", "hello", "hey", "help me")
		const isSimpleGreeting = !isSellIntent && !isBuyIntent && !searchParams.location && (fullTextLower === "hi" || fullTextLower === "hello" || fullTextLower === "hey" || fullTextLower === "help" || fullTextLower.length < 5);

		let plainTextSummary = "";
		let htmlContent = "";

		if (isSimpleGreeting) {
			// SIMPLE GREETING RESPONSE - ASK QUALIFYING QUESTIONS WITHOUT SHOWING PROPERTIES
			plainTextSummary = `Hello,

Thank you for reaching out to Gulfshore Group Real Estate! I am Dimitri Schwarz's AI Real Estate Concierge.

To help us find the perfect properties or assist you immediately, please let me know:
1. Location: Which city in Southwest Florida are you interested in? (e.g., Naples, Sanibel, Cape Coral, Fort Myers, Bonita Springs, Estero, Marco Island)
2. Target Budget: What is your price range?
3. Intent: Are you looking to Buy, Sell, or Both?

Best regards,
Dimitri Schwarz & AI Team
Gulfshore Group Real Estate
${baseUrl}`;

			htmlContent = buildHtmlGreetingEmail();
		} else if (isSellIntent && !isBuyIntent) {
			// SELLER INTENT ONLY
			plainTextSummary = `Hello,

Thank you for reaching out to Gulfshore Group Real Estate!

Dimitri Schwarz provides complimentary, high-precision Home Valuations (Comparative Market Analysis) and full listing representation across Southwest Florida.

To list your property for sale or get a free home market valuation immediately, please visit our seller portal:
${baseUrl}/sell

Best regards,
Dimitri Schwarz & AI Team
Gulfshore Group Real Estate
${baseUrl}`;

			// If location specified, query reference listings for seller
			const targetLoc = searchParams.location || "Naples";
			const refProperties = await prisma.property.findMany({
				where: {
					StandardStatus: "Active",
					OR: [
						{ City: { contains: targetLoc } },
						{ Community: { contains: targetLoc } },
						{ FullAddress: { contains: targetLoc } },
					]
				},
				take: 4,
				orderBy: { ListPrice: 'desc' },
				select: {
					id: true, FullAddress: true, ListPrice: true, BedroomsTotal: true,
					BathroomsTotalInteger: true, LivingArea: true, PropertyType: true,
					City: true, Community: true, MLSNumber: true, PoolPrivateYN: true,
					WaterfrontYN: true, ListOfficeName: true, images: true, media: { take: 1, select: { MediaURL: true } }
				}
			});

			htmlContent = buildHtmlPropertyEmail(
				targetLoc,
				refProperties,
				"COMPLIMENTARY HOME VALUATION & SELLER SERVICES",
				`Dimitri Schwarz offers full listing representation. Visit <a href="${baseUrl}/sell" style="color: #dc2626; font-weight: bold;">Seller Portal</a> to list your home. Here are active market listings in ${targetLoc} for reference:`
			);
		} else {
			// BUY INTENT OR SPECIFIC LOCATION SEARCH
			const targetLocation = searchParams.location || "Naples";
			console.log(`[Resend Webhook DB Query] Target Location: "${targetLocation}", Params:`, JSON.stringify(searchParams));

			const dbWhere: any = {
				StandardStatus: "Active",
				OR: [
					{ City: { contains: targetLocation } },
					{ Community: { contains: targetLocation } },
					{ FullAddress: { contains: targetLocation } },
					{ PostalCode: { contains: targetLocation } },
				]
			};

			if (searchParams.maxPrice) dbWhere.ListPrice = { lte: searchParams.maxPrice };
			if (searchParams.beds) dbWhere.BedroomsTotal = { gte: searchParams.beds };
			if (searchParams.baths) dbWhere.BathroomsTotalInteger = { gte: searchParams.baths };
			if (searchParams.poolOnly) dbWhere.PoolPrivateYN = true;
			if (searchParams.waterfrontOnly) dbWhere.WaterfrontYN = true;

			// STRICT QUERY - NO RELAXED NAPLES FALLBACK IF 0 MATCHES FOR TARGET LOCATION!
			const properties = await prisma.property.findMany({
				where: dbWhere,
				take: 6,
				orderBy: { ListPrice: 'desc' },
				select: {
					id: true,
					FullAddress: true,
					ListPrice: true,
					BedroomsTotal: true,
					BathroomsTotalInteger: true,
					LivingArea: true,
					PropertyType: true,
					PropertySubType: true,
					City: true,
					StateOrProvince: true,
					PostalCode: true,
					Community: true,
					MLSNumber: true,
					PoolPrivateYN: true,
					WaterfrontYN: true,
					GulfAccessYN: true,
					ListOfficeName: true,
					images: true,
					media: {
						take: 1,
						select: { MediaURL: true }
					}
				}
			});

			console.log(`[Resend Webhook DB Query] Found ${properties.length} active properties for location "${targetLocation}"`);

			if (properties.length > 0) {
				plainTextSummary = `Hello,

Thank you for reaching out to Gulfshore Group! Here are top active property listings currently available in ${targetLocation}:

${properties.map((p, i) => `${i + 1}. ${p.FullAddress} - $${p.ListPrice?.toLocaleString()} (${baseUrl}${UrlMaker(p.City || "", p.Community || "", p.FullAddress || "", p.MLSNumber || undefined)})`).join("\n")}

Best regards,
Dimitri Schwarz & AI Team
Gulfshore Group Real Estate
${baseUrl}`;

				htmlContent = buildHtmlPropertyEmail(
					targetLocation,
					properties,
					`ACTIVE HOMES MATCHING YOUR SEARCH`,
					`We found ${properties.length} active luxury properties matching your search criteria in ${targetLocation}. Each listing has been curated for quality and value.`
				);
			} else {
				// STRICT NO-FALLBACK RULE: Polite Apology + SWFL Specialty explanation (NO Naples fake fallback!)
				plainTextSummary = `Hello,

Thank you for reaching out to Gulfshore Group Real Estate!

We currently do not have active listings matching your exact search criteria in ${targetLocation.toUpperCase()}.

Gulfshore Group specializes exclusively in Southwest Florida real estate (Naples, Bonita Springs, Cape Coral, Fort Myers, Estero, Marco Island, Sanibel, etc.).

Please let us know if you would like us to set up a custom property alert for you or search another location in Southwest Florida!

Best regards,
Dimitri Schwarz & AI Team
Gulfshore Group Real Estate
${baseUrl}`;

				htmlContent = buildHtmlPropertyEmail(
					targetLocation,
					[],
					`NO ACTIVE HOMES FOUND`,
					`We currently do not have active listings matching your exact criteria in ${targetLocation.toUpperCase()}.`
				);
			}
		}

		console.log(`[Resend Webhook Success] Generated luxury email response.`);

		// 5. Save response to AIChatHistory
		await prisma.aIChatHistory.create({
			data: {
				leadId: lead.id,
				channel: "email",
				role: "ai",
				message: plainTextSummary,
			}
		});

		// Recalculate lead score
		try {
			recalculateLeadScore(lead.id);
		} catch (scoreErr) {
			console.error("Scoring error:", scoreErr);
		}

		// 6. Build email thread headers so Gmail stacks replies in the SAME thread
		const sendHeaders: Record<string, string> = {};
		if (messageId && messageId.includes("@")) {
			const formattedMsgId = messageId.startsWith("<") && messageId.endsWith(">") ? messageId : `<${messageId}>`;
			sendHeaders["In-Reply-To"] = formattedMsgId;
			sendHeaders["References"] = formattedMsgId;
		}

		// 7. Send the luxury email card response back via Resend inside the SAME thread
		try {
			const sendResult = await resend.emails.send({
				from: process.env.RESEND_FROM_EMAIL || "Gulfshore Group <noreply@updates.gulfshoregroup.com>",
				to: cleanFromEmail,
				subject: replySubject,
				text: plainTextSummary,
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

import prisma from "@/lib/prisma";
import { sendSMS } from "@/lib/twilio";
import { buildQueryFromFilters } from "@/lib/search-filters";
import { sendPropertyAlert } from "@/lib/leads/services/property-alerts";

/**
 * Checks for new properties matching saved searches and sends SMS/Email alerts.
 * Also sends a generic "Top New Listing" daily blast to all other leads.
 */
export async function processSavedSearches() {
	console.log("[SavedSearch] Starting to process saved searches & generic alerts...");

	try {
		// Keep track of leads who received personalized alerts so we don't double-email them
		const alertedLeadIds = new Set<string>();

		// ---------------------------------------------------------
		// 1. PERSONALIZED ALERTS (Saved Searches)
		// ---------------------------------------------------------
		const activeSearches = await prisma.savedSearch.findMany({
			where: { notify: true },
			include: { user: true },
		});

		for (const search of activeSearches) {
			const lead = search.user;
			if (!lead) continue;

			// Look back 24 hours if never checked
			const lookbackDate = search.lastNotifiedAt
				? search.lastNotifiedAt
				: new Date(Date.now() - 24 * 60 * 60 * 1000);

			const filtersObj = search.filters as any;
			const baseWhere = buildQueryFromFilters(filtersObj || {});

			const finalWhere = {
				...baseWhere,
				StandardStatus: "Active",
				createdAt: { gt: lookbackDate },
			};

			const matchingProperties = await prisma.property.findMany({
				where: finalWhere,
				take: 1, // Get the top match
			});

			if (matchingProperties.length > 0) {
				const prop = matchingProperties[0];
				
				// FORMAT SMS
				let priceStr = prop.ListPrice ? `$${prop.ListPrice.toLocaleString()}` : "Price TBD";
				if (prop.ListPrice && prop.ListPrice >= 1000000) {
					priceStr = `${(prop.ListPrice / 1000000).toFixed(1)} Million`;
				}
				const beds = prop.BedroomsTotal || "2+";
				const baths = prop.BathroomsTotalInteger || "2+";
				const poolStr = prop.PoolPrivateYN ? "pool home" : "home";

				const searchTitle = search.name && search.name !== "Saved Search" ? search.name : `${beds} bed ${baths} bath ${poolStr} under ${priceStr}`;
				const smsMessage = `Dimitri Schwarz 239.992.9119 GulfShoreGroup.com - ${searchTitle} - New Listing`;

				// SEND SMS
				if (lead.phone) {
					console.log(`[SavedSearch] Match found for Lead ${lead.email}. Sending SMS.`);
					await sendSMS(lead.phone, smsMessage).catch(err => console.error("SMS Error:", err));
				}

				// SEND EMAIL
				if (lead.email) {
					console.log(`[SavedSearch] Sending Email to ${lead.email}.`);
					await sendPropertyAlert({
						to: lead.email,
						recipientName: lead.firstName || "Valued Client",
						subject: `New Property Match: ${searchTitle}`,
						alertTitle: "A New Home Matching Your Search",
						alertSubtitle: `We found a new ${poolStr} in ${prop.City} that matches your saved preferences.`,
						properties: prop as any,
					}).catch(err => console.error("Email Error:", err));
				}

				alertedLeadIds.add(lead.id);

				// Update lastNotifiedAt
				await prisma.savedSearch.update({
					where: { id: search.id },
					data: { lastNotifiedAt: new Date() },
				});
			}
		}

		// ---------------------------------------------------------
		// 2. GENERIC BLAST TO ALL OTHER LEADS (Once a day at ~10 AM EDT / 14:00 UTC)
		// ---------------------------------------------------------
		const currentUTCHour = new Date().getUTCHours();
		const isDailyBlastHour = currentUTCHour === 14; 
		
		// If it's the daily blast hour, send to everyone else
		if (isDailyBlastHour) {
			console.log("[SavedSearch] Running Daily Generic Blast for all other leads...");
			
			// Find the absolute newest active property from the last 24 hours
			const newestProperty = await prisma.property.findFirst({
				where: { 
					StandardStatus: "Active",
					createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
				},
				orderBy: { createdAt: 'desc' }
			});

			if (newestProperty) {
				const allLeads = await prisma.lead.findMany({
					where: {
						id: { notIn: Array.from(alertedLeadIds) }, // Skip leads who already got a personalized alert today
					}
				});

				for (const lead of allLeads) {
					// SEND SMS (Generic)
					if (lead.phone) {
						let priceStr = newestProperty.ListPrice ? `$${newestProperty.ListPrice.toLocaleString()}` : "";
						const smsMessage = `Dimitri Schwarz 239.992.9119 GulfShoreGroup.com - Featured New Listing in ${newestProperty.City} ${priceStr}`;
						await sendSMS(lead.phone, smsMessage).catch(err => console.error("SMS Error:", err));
					}

					// SEND EMAIL (Generic)
					if (lead.email) {
						await sendPropertyAlert({
							to: lead.email,
							recipientName: lead.firstName || "Valued Client",
							subject: `Featured New Listing in ${newestProperty.City}`,
							alertTitle: "A Naples Area Home for You",
							alertSubtitle: `Here is a brand new listing we think you'll love.`,
							properties: newestProperty as any,
						}).catch(err => console.error("Email Error:", err));
					}
				}
				console.log(`[SavedSearch] Sent generic daily blast to ${allLeads.length} leads.`);
			} else {
				console.log("[SavedSearch] No new properties in the last 24h for the generic blast.");
			}
		}

		console.log("[SavedSearch] Finished processing saved searches and alerts.");
	} catch (error) {
		console.error("[SavedSearch] Error processing searches:", error);
	}
}

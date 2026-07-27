import prisma from "@/lib/prisma";
import { sendSMS } from "@/lib/twilio";
import { buildPrismaWhereClause } from "@/lib/search-filters";

/**
 * Checks for new properties matching saved searches and sends SMS/Email alerts.
 */
export async function processSavedSearches() {
	console.log("[SavedSearch] Starting to process saved searches...");

	try {
		// 1. Find all saved searches that have notifications enabled
		const activeSearches = await prisma.savedSearch.findMany({
			where: { notify: true },
			include: { user: true },
		});

		for (const search of activeSearches) {
			const lead = search.user;
			if (!lead || !lead.phone) continue; // Need phone for SMS

			// 2. We only want properties synced SINCE the last time we checked this search.
			// If it's never been checked, check last 24 hours.
			const lookbackDate = search.lastNotifiedAt
				? search.lastNotifiedAt
				: new Date(Date.now() - 24 * 60 * 60 * 1000);

			// 3. Build the Prisma where clause from the saved JSON filters
			const filtersObj = search.filters as any;
			const baseWhere = buildPrismaWhereClause(filtersObj || {});

			// 4. Combine base filters with our time constraint and status Active
			const finalWhere = {
				...baseWhere,
				StandardStatus: "Active",
				createdAt: { gt: lookbackDate }, // Must be newly added to our DB
			};

			// 5. Query matching new properties
			const matchingProperties = await prisma.property.findMany({
				where: finalWhere,
				take: 5, // We just need to know if there's at least 1, but let's grab a few for the message
				select: {
					BedroomsTotal: true,
					BathroomsTotalInteger: true,
					PoolPrivateYN: true,
					ListPrice: true,
				},
			});

			if (matchingProperties.length > 0) {
				const prop = matchingProperties[0];
				
				// Format price e.g. 1500000 -> 1.5 Million
				let priceStr = prop.ListPrice ? `$${prop.ListPrice.toLocaleString()}` : "Price TBD";
				if (prop.ListPrice && prop.ListPrice >= 1000000) {
					priceStr = `${(prop.ListPrice / 1000000).toFixed(1)} Million`;
				}

				const beds = prop.BedroomsTotal || "2+";
				const baths = prop.BathroomsTotalInteger || "2+";
				const poolStr = prop.PoolPrivateYN ? "pool home" : "home";

				// Custom Message Format requested by client
				const message = `Dimitri Schwarz 239.992.9119 GulfShoreGroup.com - ${beds} bedroom ${baths} bath ${poolStr} under ${priceStr}. - New Listing`;

				console.log(`[SavedSearch] Match found for Lead ${lead.email}. Sending SMS: "${message}"`);
				
				// Send SMS
				await sendSMS(lead.phone, message);

				// 6. Update lastNotifiedAt
				await prisma.savedSearch.update({
					where: { id: search.id },
					data: { lastNotifiedAt: new Date() },
				});
			}
		}
		
		console.log("[SavedSearch] Finished processing saved searches.");
	} catch (error) {
		console.error("[SavedSearch] Error processing searches:", error);
	}
}

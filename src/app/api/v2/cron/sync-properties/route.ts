import { NextRequest } from "next/server";
import { syncTodaysActiveProperties } from "@/jobs/syncProperties";
import prisma from "@/lib/prisma";

/**
 * Auto-sync cron endpoint.
 * 
 * On Railway: Set a cron job to hit this URL every hour:
 *   GET /api/v2/cron/sync-properties
 * 
 * This ensures new listings that come on market are always in the DB
 * within ~1 hour of being listed on MLS.
 */
export async function GET(req: NextRequest) {
	// Optional: protect with a secret token
	const token = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("token");
	const expectedToken = process.env.CRON_SECRET;
	if (expectedToken && token !== expectedToken) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		// Find the most recent BridgeModificationTimestamp in our DB
		const lastSynced = await prisma.property.findFirst({
			where: { StandardStatus: "Active" },
			orderBy: { BridgeModificationTimestamp: "desc" },
			select: { BridgeModificationTimestamp: true },
		});

		// Look back 2 days from the last known modification to avoid gaps
		let queryDate: string;
		if (lastSynced?.BridgeModificationTimestamp) {
			const lookback = new Date(
				lastSynced.BridgeModificationTimestamp.getTime() - 2 * 24 * 60 * 60 * 1000
			);
			queryDate = lookback.toISOString().split("T")[0];
		} else {
			// If DB is empty, sync last 7 days
			queryDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
				.toISOString()
				.split("T")[0];
		}

		console.log(`[Cron] Auto-sync triggered — modification lookback: ${queryDate}`);

		await syncTodaysActiveProperties({ count: 0, date: queryDate });

		return Response.json({
			success: true,
			message: "Sync completed",
			syncedFrom: queryDate,
			triggeredAt: new Date().toISOString(),
		});
	} catch (err: any) {
		console.error("[Cron] Sync failed:", err?.message);
		return Response.json(
			{ success: false, error: err?.message || "Sync failed" },
			{ status: 500 }
		);
	}
}

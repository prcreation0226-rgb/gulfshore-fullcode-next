import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
	try {
		const query = req.nextUrl.searchParams;
		const city = query.get("city");
		const community = query.get("community");

		if (!city) {
			return NextResponse.json({ error: "City is required" }, { status: 400 });
		}

		// Where clause for location
		const locationWhere: any = { City: city };
		if (community) {
			// Using Development or SubdivisionName depending on how community is passed
			locationWhere.OR = [
				{ Community: community },
				{ SubdivisionName: community },
				{ Development: community }
			];
		}

		// Active Properties Stats
		const activeStats = await prisma.property.aggregate({
			where: { ...locationWhere, StandardStatus: "Active" },
			_count: { id: true },
			_avg: { ListPrice: true },
		});

		// Sold Properties Stats (last 30 days)
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

		const soldStats = await prisma.property.aggregate({
			where: { 
				...locationWhere, 
				StandardStatus: { in: ["Closed", "Sold"] },
				StatusChangeTimestamp: { gte: thirtyDaysAgo }
			},
			_count: { id: true },
			_avg: { ClosePrice: true, DaysOnMarket: true },
		});

		return NextResponse.json({
			success: true,
			data: {
				activeListings: activeStats._count.id || 0,
				avgListPrice: activeStats._avg.ListPrice || 0,
				soldListings30Days: soldStats._count.id || 0,
				avgSoldPrice: soldStats._avg.ClosePrice || 0,
				avgDaysOnMarket: soldStats._avg.DaysOnMarket || 0,
			}
		});
	} catch (error: any) {
		console.error("[Market Report API Error]", error);
		return NextResponse.json({ success: false, error: error.message }, { status: 500 });
	}
}

import prisma from "@/lib/prisma";
import { ApiError } from "@/lib/api/errors";
import {
	buildPaginatedResult,
	type PaginatedResult,
} from "@/lib/api/pagination";
import { PROPERTY_SUMMARY_SELECT } from "@/lib/leads/constants";
import type { TrackViewedPropertyResult } from "@/lib/leads/types";

type ListViewedOptions = {
	leadId: string;
	page: number;
	limit: number;
	sortBy: "lastViewedAt" | "viewedAt" | "viewCount";
	sortOrder: "asc" | "desc";
};

export async function trackViewedProperty(
	leadId: string,
	propertyId: string
): Promise<TrackViewedPropertyResult> {
	const property = await prisma.property.findUnique({
		where: { id: propertyId },
		select: { id: true },
	});

	if (!property) {
		throw new ApiError(404, "Property not found", "PROPERTY_NOT_FOUND");
	}

	const now = new Date();

	return prisma.$transaction(async (tx) => {
		const existing = await tx.viewedProperty.findUnique({
			where: {
				userId_propertyId: {
					userId: leadId,
					propertyId,
				},
			},
		});

		if (existing) {
			const updated = await tx.viewedProperty.update({
				where: { id: existing.id },
				data: {
					viewCount: { increment: 1 },
					lastViewedAt: now,
				},
			});

			return {
				id: updated.id,
				propertyId: updated.propertyId,
				viewCount: updated.viewCount,
				viewedAt: updated.viewedAt,
				lastViewedAt: updated.lastViewedAt,
				isNewView: false,
			};
		}

		const created = await tx.viewedProperty.create({
			data: {
				userId: leadId,
				propertyId,
				viewedAt: now,
				lastViewedAt: now,
				viewCount: 1,
			},
		});

		return {
			id: created.id,
			propertyId: created.propertyId,
			viewCount: created.viewCount,
			viewedAt: created.viewedAt,
			lastViewedAt: created.lastViewedAt,
			isNewView: true,
		};
	});
}

export async function listViewedProperties(
	options: ListViewedOptions
): Promise<PaginatedResult<unknown>> {
	const { leadId, page, limit, sortBy, sortOrder } = options;
	const skip = (page - 1) * limit;

	const where = { userId: leadId };

	const [total, items] = await prisma.$transaction([
		prisma.viewedProperty.count({ where }),
		prisma.viewedProperty.findMany({
			where,
			orderBy: { [sortBy]: sortOrder },
			skip,
			take: limit,
			include: {
				property: {
					select: PROPERTY_SUMMARY_SELECT,
				},
			},
		}),
	]);

	return buildPaginatedResult(items, total, page, limit);
}

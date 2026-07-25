import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

async function getMappedLead(id: string) {
	const lead = await prisma.lead.findUnique({
		where: { id },
		include: {
			notes: {
				orderBy: {
					createdAt: "desc",
				},
			},
			inquiryHistory: {
				orderBy: {
					createdAt: "desc",
				},
			},
			savedSearch: {
				orderBy: {
					createdAt: "desc",
				},
			},
		},
	});

	if (!lead) return null;

	let parsedTags: string[] = [];
	if (lead.tags) {
		try {
			const raw = typeof lead.tags === "string" ? JSON.parse(lead.tags) : lead.tags;
			if (Array.isArray(raw)) {
				parsedTags = raw.filter((t: any) => typeof t === "string");
			} else if (typeof raw === "object" && raw !== null) {
				parsedTags = Object.values(raw).filter((t: any) => typeof t === "string");
			}
		} catch {
			parsedTags = [];
		}
	}

	const mappedCriteria = (lead.savedSearch || []).map((s) => {
		const f = typeof s.filters === "string" ? JSON.parse(s.filters) : s.filters || {};
		return {
			_id: s.id,
			city: f.city || f.City || "",
			developmentName: f.developmentName || f.community || "",
			beds: f.beds || "",
			baths: f.baths || "",
			minPrice: f.minPrice || "",
			maxPrice: f.maxPrice || "",
			propertyTypes: f.propertyTypes || [],
			features: f.features || [],
		};
	});

	return {
		...lead,
		_id: lead.id,
		fullName: lead.fullName || `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Unknown User",
		tags: parsedTags,
		propertyCriteria: mappedCriteria,


		notes: lead.notes.map((n) => ({
			_id: n.id,
			content: n.message,
			createdAt: n.createdAt,
		})),
		inquiryHistory: lead.inquiryHistory.map((i) => ({
			_id: i.id,
			type: i.type,
			message: i.message,
			propertyId: i.propertyId,
			createdAt: i.createdAt,
		})),
	};
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;
		const lead = await getMappedLead(id);
		if (!lead) {
			return NextResponse.json(
				{ error: "Lead not found" },
				{ status: 404 }
			);
		}
		return NextResponse.json(lead);
	} catch (error: any) {
		console.error("Error fetching lead detail:", error);
		return NextResponse.json(
			{ error: "Failed to fetch lead", details: error.message },
			{ status: 500 }
		);
	}
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;
		const body = await req.json();

		const updateData: any = {};
		if (body.status !== undefined) updateData.status = body.status;
		if (body.tags !== undefined) updateData.tags = body.tags;
		if (body.firstName !== undefined) updateData.firstName = body.firstName;
		if (body.lastName !== undefined) updateData.lastName = body.lastName;
		if (body.email !== undefined) updateData.email = body.email;
		if (body.phone !== undefined) updateData.phone = body.phone;
		if (body.fullName !== undefined) updateData.fullName = body.fullName;

		await prisma.lead.update({
			where: { id },
			data: updateData,
		});

		const lead = await getMappedLead(id);
		return NextResponse.json(lead);
	} catch (error: any) {
		console.error("Error updating lead:", error);
		return NextResponse.json(
			{ error: "Failed to update lead", details: error.message },
			{ status: 500 }
		);
	}
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;
		await prisma.lead.delete({
			where: { id },
		});
		return NextResponse.json({
			message: "Lead deleted successfully",
		});
	} catch (error: any) {
		console.error("Error deleting lead:", error);
		return NextResponse.json(
			{ error: "Failed to delete lead", details: error.message },
			{ status: 500 }
		);
	}
}

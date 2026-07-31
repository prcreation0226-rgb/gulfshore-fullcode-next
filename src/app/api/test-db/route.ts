import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
	const msgs = await prisma.aIChatHistory.findMany({
		orderBy: { createdAt: "desc" },
		take: 10
	});
	return NextResponse.json(msgs);
}

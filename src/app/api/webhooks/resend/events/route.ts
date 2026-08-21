import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		console.log("[Resend Outbound Event Webhook Payload Received]:", JSON.stringify(body));
		return NextResponse.json({ success: true });
	} catch (error: any) {
		console.error("Resend Events Webhook Error:", error);
		return NextResponse.json({ error: error.message || "Webhook failed" }, { status: 500 });
	}
}

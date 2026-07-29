import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
	try {
		const payload = await req.json();

		// Resend Inbound Webhook format usually sends the email under 'text' or 'html'
		// Example structure: { from: 'user@email.com', to: '...', subject: '...', text: '...' }
		const fromEmail = payload.from || payload.sender;
		const subject = payload.subject || "No Subject";
		const textBody = payload.text || payload.html || "";

		if (!fromEmail || !textBody) {
			return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
		}

		// Clean the email address if it comes in format "Name <email@domain.com>"
		const match = fromEmail.match(/<([^>]+)>/);
		const cleanEmail = match ? match[1] : fromEmail.trim();

		// Find the lead by email
		let lead = await prisma.lead.findUnique({
			where: { email: cleanEmail },
		});

		// If lead doesn't exist, we can optionally create one (or ignore)
		if (!lead) {
			lead = await prisma.lead.create({
				data: {
					email: cleanEmail,
					firstName: "New",
					lastName: "Lead",
					fullName: "New Lead",
					source: "Inbound Email",
					status: "New",
				},
			});
		}

		// 1. Save User's Email to AI Chat History
		await prisma.aIChatHistory.create({
			data: {
				leadId: lead.id,
				channel: "email",
				role: "user",
				message: `Subject: ${subject}\n\n${textBody}`,
			}
		});

		// 2. Fetch past context for the AI
		const pastChats = await prisma.aIChatHistory.findMany({
			where: { leadId: lead.id },
			orderBy: { createdAt: 'asc' },
			take: 20
		});

		const formattedHistory = pastChats.map(chat => ({
			role: chat.role === "ai" ? "assistant" : "user",
			content: chat.message
		}));

		// 3. Generate AI Response
		const { text: aiResponse } = await generateText({
			model: openai("gpt-4o-mini"),
			system: `You are an expert AI Real Estate Concierge for Gulfshore Group, working on behalf of Dimitri Schwarz. 
You are replying to an email from a client. Keep your tone highly professional, concise, and helpful. 
Do not use emojis excessively. Format your response exactly like a professional email body (no need for Subject line, just the body). 
Sign off with:
Best regards,
Gulfshore Group AI Concierge
on behalf of Dimitri Schwarz`,
			messages: formattedHistory as any,
		});

		// 4. Send the Email back to the user via Resend
		const adminEmail = process.env.ADMIN_ALERT_EMAIL || "mailbox@gulfshoregroup.com";
		
		await resend.emails.send({
			from: process.env.RESEND_FROM_EMAIL || "Gulfshore Group <noreply@updates.gulfshoregroup.com>",
			to: cleanEmail,
			subject: `Re: ${subject}`,
			text: aiResponse,
		});

		// 5. Save AI's Reply to AI Chat History
		await prisma.aIChatHistory.create({
			data: {
				leadId: lead.id,
				channel: "email",
				role: "ai",
				message: aiResponse,
			}
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("[EmailWebhookError]", error);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}

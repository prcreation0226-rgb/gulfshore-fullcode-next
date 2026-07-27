import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import twilio from "twilio";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const getResendClient = () => {
	const key = process.env.RESEND_API_KEY || "re_dummy_key_for_build";
	return new Resend(key);
};

export async function GET() {
	try {
		const resend = getResendClient();
		// 1. Fetch all active campaigns
		const campaigns = await prisma.dripCampaign.findMany({
			where: { status: "active" },
		});

		if (campaigns.length === 0) {
			return NextResponse.json({ success: true, message: "No active campaigns found." });
		}

		let totalSent = 0;
		const now = new Date();

		for (const campaign of campaigns) {
			let eligibleLeads: any[] = [];

			if (campaign.daysAfterSignup === -1) {
				// 10 minutes mode for testing
				const targetDateEnd = new Date();
				targetDateEnd.setMinutes(now.getMinutes() - 10);
				
				const targetDateStart = new Date();
				targetDateStart.setMinutes(now.getMinutes() - 10 - 60); // 1 hour window to catch it

				eligibleLeads = await prisma.lead.findMany({
					where: {
						createdAt: {
							gte: targetDateStart,
							lte: targetDateEnd,
						},
					},
				});
			} else if (campaign.daysAfterSignup === 0) {
				// Immediate / Test mode (0 days = signed up recently / last 24h)
				eligibleLeads = await prisma.lead.findMany({
					orderBy: { createdAt: "desc" },
					take: 50,
				});
			} else {
				const targetDateEnd = new Date();
				targetDateEnd.setDate(now.getDate() - campaign.daysAfterSignup);
				
				const targetDateStart = new Date();
				targetDateStart.setDate(now.getDate() - campaign.daysAfterSignup - 5);

				eligibleLeads = await prisma.lead.findMany({
					where: {
						createdAt: {
							gte: targetDateStart,
							lte: targetDateEnd,
						},
					},
				});
			}

			for (const lead of eligibleLeads) {
				// Check if already sent
				const existingLog = await prisma.dripCampaignLog.findUnique({
					where: {
						campaignId_userId: {
							campaignId: campaign.id,
							userId: lead.id,
						},
					},
				});

				if (!existingLog) {
					// We need to send it!
					let sent = false;
					
					// Replace variables in message
					const personalizedMessage = campaign.messageTemplate
						.replace(/{{name}}/g, lead.firstName || "there")
						.replace(/{{email}}/g, lead.email || "");

					const isEmail = campaign.channel === "Email" || campaign.channel === "email" || campaign.channel === "Both";
					const isSMS = campaign.channel === "SMS" || campaign.channel === "text" || campaign.channel === "Both";

					if (isEmail && lead.email) {
						try {
							await resend.emails.send({
								from: process.env.RESEND_FROM_EMAIL || "Gulfshore Group <onboarding@resend.dev>",
								to: lead.email,
								subject: campaign.name,
								html: `<p>${personalizedMessage.replace(/\\n/g, "<br/>")}</p>`,
							});
							sent = true;
						} catch (e) {
							console.error("Email send failed:", e);
						}
					} 
					
					if (isSMS && lead.phone) {
						try {
							const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
							await client.messages.create({
								body: personalizedMessage,
								from: process.env.TWILIO_NUMBER,
								to: lead.phone,
							});
							sent = true;
						} catch (e) {
							console.error("SMS send failed:", e);
						}
					}

					if (sent) {
						await prisma.dripCampaignLog.create({
							data: {
								campaignId: campaign.id,
								userId: lead.id,
								status: "sent",
							},
						});
						totalSent++;
					}
				}
			}
		}

		return NextResponse.json({ success: true, message: `Successfully sent ${totalSent} drip notifications.` });
	} catch (error: any) {
		console.error("Drip Cron Error:", error);
		return NextResponse.json({ success: false, message: error.message }, { status: 500 });
	}
}

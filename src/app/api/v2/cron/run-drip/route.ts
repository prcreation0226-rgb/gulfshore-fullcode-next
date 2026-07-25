import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import twilio from "twilio";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET() {
	try {
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
			// Find leads that signed up `daysAfterSignup` days ago.
			// To be safe against missed cron days, we look for leads who signed up between 
			// (daysAfterSignup + 5) days ago and daysAfterSignup days ago.
			
			const targetDateEnd = new Date();
			targetDateEnd.setDate(now.getDate() - campaign.daysAfterSignup);
			
			const targetDateStart = new Date();
			targetDateStart.setDate(now.getDate() - campaign.daysAfterSignup - 5);

			const eligibleLeads = await prisma.lead.findMany({
				where: {
					createdAt: {
						gte: targetDateStart,
						lte: targetDateEnd,
					},
				},
			});

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

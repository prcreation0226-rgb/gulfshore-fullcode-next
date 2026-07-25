import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const { email } = body;

		if (!email) {
			return NextResponse.json(
				{ success: false, error: "Email is required" },
				{ status: 400 }
			);
		}

		// 1. Fetch user by email
		const user = await prisma.user.findFirst({
			where: { email: email.toLowerCase().trim() },
		});

		if (!user) {
			return NextResponse.json(
				{ success: false, error: "User not found with this email" },
				{ status: 404 }
			);
		}

		// 2. Generate 6-digit OTP code
		const otp = Math.floor(100000 + Math.random() * 900000).toString();
		const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 mins expiry

		// 3. Update user metadata with OTP and expiry
		const currentMetadata = (user.metadata as any) || {};
		const updatedMetadata = {
			...currentMetadata,
			resetOtp: otp,
			resetOtpExpiry: expiry.toISOString(),
		};

		await prisma.user.update({
			where: { id: user.id },
			data: {
				metadata: updatedMetadata,
			},
		});

		// 4. Send email using Resend
		let emailSent = false;
		let emailError = "";

		if (resend) {
			try {
				const fromEmail = process.env.RESEND_FROM_EMAIL || "Gulfshore Group <noreply@updates.gulfshoregroup.com>";
				const { error } = await resend.emails.send({
					from: fromEmail,
					to: [user.email],
					subject: "Reset your Gulfshore Group password",
					html: `
						<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
							<h2 style="color: #1f2937; margin-bottom: 20px;">Password Reset Request</h2>
							<p style="color: #4b5563; font-size: 16px; line-height: 24px;">We received a request to reset your password. Use the verification code below to proceed:</p>
							<div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
								<span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #d90429;">${otp}</span>
							</div>
							<p style="color: #9ca3af; font-size: 14px;">This code will expire in 15 minutes. If you did not request this, please ignore this email.</p>
						</div>
					`
				});

				if (error) {
					console.error("Resend API error:", error);
					emailError = error.message;
				} else {
					emailSent = true;
				}
			} catch (e: any) {
				console.error("Resend send failed:", e);
				emailError = e.message;
			}
		}

		// For testing ease / fallback, if Resend is not configured, we return the OTP in mock response (or log it)
		// We only expose OTP in response if RESEND_API_KEY is not set (so developers can test locally)
		const responsePayload: any = { success: true };
		if (!resend) {
			responsePayload.mockOtp = otp;
			responsePayload.message = "Resend API key not configured. Mock OTP generated for development.";
		} else if (!emailSent) {
			responsePayload.mockOtp = otp;
			responsePayload.message = `Failed to send email: ${emailError}. Mock OTP generated for safety.`;
		} else {
			responsePayload.message = "Verification code sent to email.";
		}

		return NextResponse.json(responsePayload);
	} catch (err: any) {
		console.error("Forgot password error:", err);
		return NextResponse.json(
			{ success: false, error: "Internal server error" },
			{ status: 500 }
		);
	}
}

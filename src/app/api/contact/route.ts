import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
	try {
		const { userId } = await auth();

		const body = await request.json();
		const { name, firstName, lastName, email, message, phone, ref, refType, userRole = "Buyer" } = body;

		const resolvedName = name || `${firstName || ""} ${lastName || ""}`.trim() || "Unknown User";
		const resolvedFirstName = firstName || name?.split(" ")[0] || "";
		const resolvedLastName = lastName || name?.split(" ").slice(1).join(" ") || "";
		const resolvedRefType = userRole === "Seller" ? "Seller-Inquiry" : userRole === "Buyer" ? "Buyer-Inquiry" : refType || "Contact-Form";
		const tagToApply = userRole === "Seller" ? "Seller" : "Buyer";

		const existingReq = await prisma.contactRequest.findFirst({
			where: {
				email,
				status: {
					in: ["New Request", "Email Sent"],
				},
			},
		});

		if (existingReq) {
			return NextResponse.json({
				message:
					"We’re already processing your earlier request. We’ll update you soon.",
				success: true,
				data: {},
			});
		}

		// 1. Fetch existing lead to preserve tags
		const existingLead = await prisma.lead.findUnique({
			where: { email },
			select: { id: true, tags: true },
		});

		let mergedTags: string[] = [tagToApply];
		if (existingLead && existingLead.tags) {
			try {
				const currentTags = typeof existingLead.tags === "string"
					? JSON.parse(existingLead.tags)
					: (existingLead.tags as string[]);
				if (Array.isArray(currentTags)) {
					mergedTags = Array.from(new Set([...currentTags, tagToApply]));
				}
			} catch (e) {
				console.error("Error parsing tags:", e);
			}
		}

		// 2. Create or update Lead in SQL
		const lead = await prisma.lead.upsert({
			where: { email },
			update: {
				firstName: resolvedFirstName,
				lastName: resolvedLastName,
				phone: phone || undefined,
				tags: mergedTags,
			},
			create: {
				firstName: resolvedFirstName,
				lastName: resolvedLastName,
				email,
				phone: phone || undefined,
				status: "New",
				source: "Contact_Form",
				tags: mergedTags,
			},
		});

		// Map to valid Prisma InquiryType enum (Contact_Form, Tour_Request, General, Home_Valuation)
		let inquiryTypeEnum: "Contact_Form" | "Tour_Request" | "General" | "Home_Valuation" = "Contact_Form";
		if (userRole === "Seller" || refType === "Home_Valuation") {
			inquiryTypeEnum = "Home_Valuation";
		} else if (refType === "Tour_Request") {
			inquiryTypeEnum = "Tour_Request";
		} else {
			inquiryTypeEnum = "Contact_Form";
		}

		// 3. Create Inquiry in SQL linked to the Lead
		await prisma.inquiry.create({
			data: {
				leadId: lead.id,
				type: inquiryTypeEnum,
				message: message || "",
			},
		});


		// 4. Create ContactRequest in SQL
		const newReq = await prisma.contactRequest.create({
			data: {
				user: userId || "",
				name: resolvedName,
				email,
				message: message || "",
				phone,
				status: "New Request",
				ref,
				refType: resolvedRefType,
			},
		});

		// 5. Instant Confirmation Email to User via Resend
		if (process.env.RESEND_API_KEY && email) {
			try {
				const { Resend } = await import("resend");
				const resendClient = new Resend(process.env.RESEND_API_KEY);
				await resendClient.emails.send({
					from: "Gulfshore Group <onboarding@resend.dev>",
					to: [email],
					subject: `Thank you for reaching out to Gulfshore Group, ${resolvedFirstName || resolvedName}!`,
					html: `
						<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; rounded-lg: 12px; background-color: #ffffff;">
							<div style="text-align: center; margin-bottom: 24px;">
								<h1 style="color: #064e3b; margin: 0; font-size: 24px;">Gulfshore Group</h1>
								<p style="color: #6b7280; font-size: 14px; margin-top: 4px;">London Forster Realty</p>
							</div>
							<h2 style="color: #111827; font-size: 18px; margin-bottom: 12px;">Hello ${resolvedName},</h2>
							<p style="color: #374151; font-size: 15px; line-height: 1.6;">
								Thank you for contacting Gulfshore Group! We have received your inquiry and our dedicated real estate specialist will be in touch with you shortly.
							</p>
							<div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; margin: 20px 0;">
								<p style="margin: 0; font-size: 14px; color: #4b5563;"><strong>Inquiry Type:</strong> ${userRole === "Seller" ? "Home Valuation / Seller" : "Buyer Inquiry"}</p>
								${message ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #4b5563;"><strong>Message:</strong> ${message}</p>` : ""}
							</div>
							<p style="color: #374151; font-size: 14px; line-height: 1.6;">
								If you have an urgent question, feel free to call us directly at <strong>+1 (239) 992-9119</strong>.
							</p>
							<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
							<p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
								© ${new Date().getFullYear()} Gulfshore Group London Forster Realty. All rights reserved.
							</p>
						</div>
					`,
				});
			} catch (emailErr) {
				console.error("Instant user confirmation email error:", emailErr);
			}
		}

		return NextResponse.json({ success: true, data: newReq });

	} catch (error: any) {
		console.error("Error saving contact request:", error);
		return NextResponse.json(
			{ error: error.message },
			{ status: 500 }
		);
	}
}

export async function GET(req: NextRequest) {
	try {

		const requests = await prisma.contactRequest.findMany({
			orderBy: {
				createdAt: "desc",
			},
		});
		const totalRequests = await prisma.contactRequest.count();

		// Map to match Mongoose shape
		const mappedRequests = requests.map((r) => ({
			...r,
			_id: r.id,
		}));

		const res = {
			totalRequests,
			requests: mappedRequests,
		};

		return NextResponse.json({ success: true, data: res });
	} catch (error: any) {
		console.error("Error fetching contact requests:", error);
		return NextResponse.json(
			{ success: false, error: "Internal Server Error", details: error.message },
			{ status: 500 }
		);
	}
}

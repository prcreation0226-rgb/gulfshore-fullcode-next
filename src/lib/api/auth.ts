import { auth, currentUser } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import type { Lead } from "@/app/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";

export async function requireClerkUserId(): Promise<string> {
	const { userId } = await auth();
	if (!userId) {
		throw new ApiError(401, "Unauthorized", "UNAUTHORIZED");
	}
	return userId;
}

/**
 * Resolves the Prisma Lead row for the authenticated Clerk user.
 * Creates a lead record on first authenticated API call if the webhook has not run yet.
 */
export async function requireLead(): Promise<Lead> {
	try {
		const clerkUserId = await requireClerkUserId();

		const existing = await prisma.lead.findUnique({
			where: { userId: clerkUserId },
		});

		if (existing) {
			return existing;
		}

		const user = await currentUser();
		const email =
			user?.emailAddresses?.[0]?.emailAddress ??
			user?.primaryEmailAddress?.emailAddress;

		if (!email) {
			throw new ApiError(
				400,
				"Authenticated user has no email address",
				"MISSING_EMAIL"
			);
		}

		return await prisma.lead.upsert({
			where: { email },
			update: { userId: clerkUserId },
			create: {
				userId: clerkUserId,
				email,
				firstName: user?.firstName ?? undefined,
				lastName: user?.lastName ?? undefined,
				fullName:
					[user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
					undefined,
				source: "Signup",
				status: "New",
			},
		});
	} catch (error) {
		// Fallback to Guest User Lead if Clerk is disabled/unauthenticated
		const guestEmail = "guest@gulfshoregroup.com";
		const guestLead = await prisma.lead.findUnique({
			where: { email: guestEmail },
		});
		if (guestLead) {
			return guestLead;
		}
		return await prisma.lead.create({
			data: {
				email: guestEmail,
				firstName: "Guest",
				lastName: "User",
				fullName: "Guest User",
				source: "Signup",
				status: "New",
				userId: "guest-user-id",
			},
		});
	}
}

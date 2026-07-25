import { Resend } from "resend";
import type { AdminLeadAlertPayload } from "@/lib/leads/types";

const resend = process.env.RESEND_API_KEY
	? new Resend(process.env.RESEND_API_KEY)
	: null;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 750;

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatActionLabel(action: AdminLeadAlertPayload["action"]): string {
	switch (action) {
		case "signup":
			return "New Lead Signup";
		case "save_property":
			return "Property Saved to Wishlist";
		case "inquiry":
			return "New Inquiry Submitted";
		case "save_search":
			return "Saved Search Created";
		default:
			return "Lead Activity";
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function buildAdminLeadAlertHtml(
	payload: AdminLeadAlertPayload
): string {
	const actionLabel = formatActionLabel(payload.action);
	const timestamp = payload.timestamp.toISOString();
	const propertyBlock = payload.property
		? `
			<tr>
				<td style="padding:8px 0;color:#64748b;font-size:14px;">Property</td>
				<td style="padding:8px 0;font-size:14px;">
					<strong>${escapeHtml(payload.property.FullAddress)}</strong><br/>
					MLS: ${escapeHtml(payload.property.MLSNumber)} ·
					$${payload.property.ListPrice?.toLocaleString() ?? "N/A"}
				</td>
			</tr>`
		: "";

	const filtersBlock = payload.filters
		? `
			<tr>
				<td style="padding:8px 0;color:#64748b;font-size:14px;">Search Filters</td>
				<td style="padding:8px 0;font-size:14px;">
					<pre style="margin:0;white-space:pre-wrap;font-family:monospace;font-size:12px;background:#f8fafc;padding:12px;border-radius:8px;">${escapeHtml(JSON.stringify(payload.filters, null, 2))}</pre>
				</td>
			</tr>`
		: "";

	const messageBlock = payload.message
		? `
			<tr>
				<td style="padding:8px 0;color:#64748b;font-size:14px;">Message</td>
				<td style="padding:8px 0;font-size:14px;">${escapeHtml(payload.message)}</td>
			</tr>`
		: "";

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(actionLabel)}</title>
</head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
	<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
		<tr>
			<td style="padding:24px 28px;background:#0f766e;color:#ffffff;">
				<h1 style="margin:0;font-size:22px;">${escapeHtml(actionLabel)}</h1>
				<p style="margin:8px 0 0;font-size:14px;opacity:0.9;">Gulfshore Group CRM Alert</p>
			</td>
		</tr>
		<tr>
			<td style="padding:28px;">
				<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
					<tr>
						<td style="padding:8px 0;color:#64748b;font-size:14px;width:140px;">Lead</td>
						<td style="padding:8px 0;font-size:14px;"><strong>${escapeHtml(payload.leadName || "Unknown")}</strong></td>
					</tr>
					<tr>
						<td style="padding:8px 0;color:#64748b;font-size:14px;">Email</td>
						<td style="padding:8px 0;font-size:14px;"><a href="mailto:${escapeHtml(payload.leadEmail)}" style="color:#0f766e;">${escapeHtml(payload.leadEmail)}</a></td>
					</tr>
					<tr>
						<td style="padding:8px 0;color:#64748b;font-size:14px;">Timestamp</td>
						<td style="padding:8px 0;font-size:14px;">${escapeHtml(timestamp)}</td>
					</tr>
					${propertyBlock}
					${filtersBlock}
					${messageBlock}
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`;
}

export async function sendAdminLeadAlertEmail(
	payload: AdminLeadAlertPayload
): Promise<{ ok: boolean; id?: string; error?: string }> {
	const to = process.env.ADMIN_ALERT_EMAIL;
	const from = process.env.RESEND_FROM_EMAIL!;

	if (!to) {
		console.warn("[Resend] ADMIN_ALERT_EMAIL is not configured");
		return { ok: false, error: "ADMIN_ALERT_EMAIL not configured" };
	}

	if (!resend) {
		console.warn("[Resend] RESEND_API_KEY is not configured");
		return { ok: false, error: "RESEND_API_KEY not configured" };
	}

	const subject = `[Lead Alert] ${formatActionLabel(payload.action)} - ${payload.leadName || payload.leadEmail}`;
	const html = buildAdminLeadAlertHtml(payload);

	let lastError: unknown;

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			const result = await resend.emails.send({
				from,
				to: [to],
				subject,
				html,
			});

			if (result.error) {
				lastError = result.error;
				if (attempt < MAX_RETRIES) {
					await sleep(RETRY_DELAY_MS * attempt);
					continue;
				}
				return { ok: false, error: result.error.message };
			}

			return { ok: true, id: result.data?.id };
		} catch (error) {
			lastError = error;
			if (attempt < MAX_RETRIES) {
				await sleep(RETRY_DELAY_MS * attempt);
				continue;
			}
		}
	}

	const message =
		lastError instanceof Error ? lastError.message : "Unknown email error";
	return { ok: false, error: message };
}

import "server-only";

import { Resend } from "resend";

const DEFAULT_FROM = "SnapBooks <noreply@mail.snapbooks.ai>";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Thin wrapper around Resend for transactional email.
 *
 * Fail-open by design: if RESEND_API_KEY is unset (e.g. local dev), the send is
 * skipped and logged rather than throwing — mirrors the Turnstile skip pattern
 * in lib/actions/apply.ts so flows that send mail keep working without a key.
 * Any Resend API error is logged and swallowed; callers should treat email as
 * best-effort and never block their primary action on it.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailParams): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`RESEND_API_KEY unset — skipping email to ${to} (${subject})`);
    return { sent: false };
  }

  const from = process.env.EMAIL_FROM || DEFAULT_FROM;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ from, to, subject, html });
    if (error) {
      console.error("Resend send failed:", error);
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.error("Unexpected error sending email:", err);
    return { sent: false };
  }
}

"use server";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/services/email";
import { buildLeadFollowupEmail } from "@/lib/emails/lead-followup";

export type ApplyFormPath = "registration" | "bookkeeping";

export interface ApplyFormData {
  path: ApplyFormPath;
  // Contact (both paths)
  contactName: string;
  email: string;
  phone: string;
  notes?: string;
  // Registration path
  companyType?: string;
  companyNames?: string[];
  businessDescription?: string;
  capitalAmount?: string;
  shareholderCount?: string;
  addressSituation?: string;
  articlesOfIncorporation?: string;
  // Bookkeeping path
  companyName?: string;
  taxId?: string;
  currentAccounting?: string;
  monthlyInvoiceVolume?: string;
  // Bot/spam protection
  turnstileToken?: string;
}

export interface ApplyResult {
  success: boolean;
  leadCode?: string;
  error?: string;
}

/**
 * Generate a human-friendly lead code: SB-XXXX-XXXX
 * Uses uppercase alphanumerics excluding ambiguous chars (0/O, 1/I/L).
 */
function generateLeadCode(): string {
  const chars = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const segment = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `SB-${segment()}-${segment()}`;
}

// When TURNSTILE_SECRET_KEY is unset (e.g. local dev), verification is skipped.
async function verifyTurnstile(token: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(8000),
      },
    );
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error("Turnstile verification failed:", err);
    return false;
  }
}

export async function submitApplyForm(
  formData: ApplyFormData,
): Promise<ApplyResult> {
  // Bot/spam check first — if Turnstile is configured, fail closed before
  // running anything else (including DB writes).
  if (!(await verifyTurnstile(formData.turnstileToken))) {
    return { success: false, error: "人機驗證失敗，請重新整理頁面後再試" };
  }

  // Validate required fields
  if (!formData.contactName?.trim()) {
    return { success: false, error: "請填寫聯絡人姓名" };
  }
  if (!formData.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
    return { success: false, error: "請填寫正確的電子信箱格式" };
  }
  if (!formData.phone?.trim() || !/^0\d{8,9}$/.test(formData.phone.trim().replace(/[-\s]/g, ""))) {
    return { success: false, error: "請填寫正確的電話號碼（例如 0912345678）" };
  }
  if (!formData.path) {
    return { success: false, error: "請選擇服務類型" };
  }

  if (formData.notes && formData.notes.length > 300) {
    return { success: false, error: "備註最多 300 字" };
  }
  if (formData.businessDescription && formData.businessDescription.length > 100) {
    return { success: false, error: "營業內容最多 100 字" };
  }

  // Path-specific validation
  if (formData.path === "bookkeeping") {
    if (!formData.companyName?.trim()) {
      return { success: false, error: "請填寫公司名稱" };
    }
    if (!formData.taxId?.trim() || !/^\d{8}$/.test(formData.taxId.trim())) {
      return { success: false, error: "請填寫正確的 8 位統一編號" };
    }
  }

  const leadCode = generateLeadCode();

  // `path` is its own column; `turnstileToken` is single-use and never persisted.
  const NON_JSONB_FIELDS = new Set<keyof ApplyFormData>(["path", "turnstileToken"]);
  const data = Object.fromEntries(
    Object.entries(formData).filter(
      ([k, v]) =>
        !NON_JSONB_FIELDS.has(k as keyof ApplyFormData) &&
        v !== undefined &&
        v !== "" &&
        !(Array.isArray(v) && v.every((s) => s === "")),
    ),
  );

  try {
    const supabase = createAdminClient();
    let finalLeadCode = leadCode;
    const { error } = await supabase.from("leads").insert({
      lead_code: leadCode,
      path: formData.path,
      data,
    });

    if (error) {
      // Unique constraint collision on lead_code — retry once
      if (error.code === "23505") {
        finalLeadCode = generateLeadCode();
        const { error: retryError } = await supabase.from("leads").insert({
          lead_code: finalLeadCode,
          path: formData.path,
          data,
        });
        if (retryError) {
          console.error("Lead insert retry failed:", retryError);
          return { success: false, error: "送出失敗，請稍後再試" };
        }
      } else {
        console.error("Lead insert failed:", error);
        return { success: false, error: "送出失敗，請稍後再試" };
      }
    }

    // Proactive follow-up email so the lead is nudged to join LINE rather than
    // left to act on their own. Run it after the response is sent: non-blocking
    // for the user, yet reliable on serverless (a bare un-awaited promise gets
    // killed when the function freezes). Best-effort — the lead is already saved
    // and the success screen shows the code, so failure must not fail submit.
    after(async () => {
      try {
        const { subject, html } = buildLeadFollowupEmail({
          path: formData.path,
          contactName: formData.contactName,
          leadCode: finalLeadCode,
          submission: data,
        });
        await sendEmail({ to: formData.email.trim(), subject, html });
      } catch (emailErr) {
        console.error("Lead follow-up email failed:", emailErr);
      }
    });

    return { success: true, leadCode: finalLeadCode };
  } catch (err) {
    console.error("Unexpected error in submitApplyForm:", err);
    return { success: false, error: "送出失敗，請稍後再試" };
  }
}

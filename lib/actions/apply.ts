"use server";

import { createClient } from "@supabase/supabase-js";

export interface ApplyFormData {
  path: "registration" | "bookkeeping";
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

export async function submitApplyForm(
  formData: ApplyFormData,
): Promise<ApplyResult> {
  // Validate required fields
  if (!formData.contactName?.trim()) {
    return { success: false, error: "請填寫聯絡人姓名" };
  }
  if (!formData.email?.trim()) {
    return { success: false, error: "請填寫電子信箱" };
  }
  if (!formData.phone?.trim()) {
    return { success: false, error: "請填寫聯絡電話" };
  }
  if (!formData.path) {
    return { success: false, error: "請選擇服務類型" };
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

  // Store all form fields in JSONB data column
  const { path, ...rest } = formData;
  const data = Object.fromEntries(
    Object.entries(rest).filter(
      ([, v]) =>
        v !== undefined &&
        v !== "" &&
        !(Array.isArray(v) && v.every((s) => s === "")),
    ),
  );

  try {
    // Use untyped client — leads table is not yet in generated database.types.ts
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { error } = await supabase.from("leads").insert({
      lead_code: leadCode,
      path,
      data,
    });

    if (error) {
      // Unique constraint collision on lead_code — retry once
      if (error.code === "23505") {
        const retryCode = generateLeadCode();
        const { error: retryError } = await supabase.from("leads").insert({
          lead_code: retryCode,
          path,
          data,
        });
        if (retryError) {
          console.error("Lead insert retry failed:", retryError);
          return { success: false, error: "送出失敗，請稍後再試" };
        }
        return { success: true, leadCode: retryCode };
      }

      console.error("Lead insert failed:", error);
      return { success: false, error: "送出失敗，請稍後再試" };
    }

    return { success: true, leadCode };
  } catch (err) {
    console.error("Unexpected error in submitApplyForm:", err);
    return { success: false, error: "送出失敗，請稍後再試" };
  }
}

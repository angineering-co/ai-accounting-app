"use server";

import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { assertStaffRole, assertStaffCanAccessClient } from "@/lib/services/authz";
import { db } from "@/lib/db/drizzle";
import { ecpay_payments, clients } from "@/lib/db/schema";
import {
  createPaymentLinkSchema,
  type CreatePaymentLinkInput,
} from "@/lib/domain/models";

// ecpay_payments 一律走 Drizzle 直連（與公開 /pay 頁一致），而 Drizzle 繞過 RLS。
// 故所有進出都先用 Supabase session 認證 + 顯式 firm 把關，再以「已驗證的 firm_id」
// 當作唯一的資料邊界。

type CallerProfile = { role: string | null; firm_id: string | null };

async function requireStaff(): Promise<{
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>;
  userId: string;
  profile: CallerProfile;
}> {
  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("尚未登入");
  const profile = await assertStaffRole(supabase, user.id);
  return { supabase, userId: user.id, profile };
}

// 非 super_admin 只能操作自己事務所；super_admin 可指定。回傳已驗證的 firm_id。
function resolveFirmId(profile: CallerProfile, requestedFirmId: string): string {
  if (profile.role === "super_admin") return requestedFirmId;
  if (!profile.firm_id || profile.firm_id !== requestedFirmId) {
    throw new Error("權限不足");
  }
  return profile.firm_id;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export interface FirmPaymentRow {
  id: string;
  type: string;
  status: string;
  amount: number;
  description: string;
  checkout_token: string;
  client_name: string | null;
  created_at: string;
  charged_at: string | null;
  expires_at: string | null;
}

/** 撈出某事務所的收款紀錄（含客戶名稱），依建立時間新到舊。 */
export async function getFirmPayments(
  requestedFirmId: string,
): Promise<FirmPaymentRow[]> {
  const { profile } = await requireStaff();
  const firmId = resolveFirmId(profile, requestedFirmId);

  return db
    .select({
      id: ecpay_payments.id,
      type: ecpay_payments.type,
      status: ecpay_payments.status,
      amount: ecpay_payments.amount,
      description: ecpay_payments.description,
      checkout_token: ecpay_payments.checkout_token,
      client_name: clients.name,
      created_at: ecpay_payments.created_at,
      charged_at: ecpay_payments.charged_at,
      expires_at: ecpay_payments.expires_at,
    })
    .from(ecpay_payments)
    .leftJoin(clients, eq(ecpay_payments.client_id, clients.id))
    .where(eq(ecpay_payments.firm_id, firmId))
    .orderBy(desc(ecpay_payments.created_at));
}

/**
 * 開立一筆一次性收款，回傳公開的 checkout_token。金額／品項由 server 端把關，
 * checkout_token 與 merchant_trade_no 在此一次產生（set-once，render 不再重生）。
 */
export async function createPaymentLink(
  input: CreatePaymentLinkInput,
): Promise<{ checkoutToken: string }> {
  const parsed = createPaymentLinkSchema.parse(input);
  const { supabase, userId, profile } = await requireStaff();
  const firmId = resolveFirmId(profile, parsed.firm_id);

  // 指定客戶時，確認該客戶屬於此事務所（Drizzle 繞過 RLS，需顯式把關）。
  if (parsed.client_id) {
    await assertStaffCanAccessClient(supabase, userId, parsed.client_id);
  }

  const expiresAt = parsed.expires_in_days
    ? new Date(Date.now() + parsed.expires_in_days * 86_400_000).toISOString()
    : null;

  // 此處只產生 checkout_token（UNIQUE，碰撞機率極低仍保留少量重試）。
  // merchant_trade_no 不在建單時產生：每次開啟 checkout 才以新的 MTN 送綠界，
  // 真正成交的 MTN 由 ReturnURL 回寫（綠界視 MTN 永久唯一，無法重用）。
  for (let attempt = 0; attempt < 3; attempt++) {
    const checkoutToken = randomUUID();
    try {
      await db.insert(ecpay_payments).values({
        firm_id: firmId,
        client_id: parsed.client_id ?? null,
        type: parsed.type,
        amount: parsed.amount,
        description: parsed.description,
        checkout_token: checkoutToken,
        expires_at: expiresAt,
      });
      revalidatePath(`/firm/${firmId}/payment-link`);
      return { checkoutToken };
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  throw new Error("產生收款連結失敗，請再試一次");
}

"use server";

import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { assertStaffRole, assertStaffCanAccessClient } from "@/lib/services/authz";
import { db } from "@/lib/db/drizzle";
import { ecpay_payments, clients } from "@/lib/db/schema";
import {
  createPaymentLinkSchema,
  markPaymentIssuedSchema,
  paymentIssuanceSchema,
  type CreatePaymentLinkInput,
  type EcpayPaymentStatus,
  type MarkPaymentIssuedInput,
  type PaymentIssuance,
} from "@/lib/domain/models";
import { getEcpayConfig } from "@/lib/services/ecpay/config";
import {
  buildDoActionParams,
  parseDoActionResponse,
} from "@/lib/services/ecpay/do-action";
import {
  isAutoCaptureBlackout,
  AUTO_CAPTURE_BLACKOUT_LABEL,
} from "@/lib/services/ecpay/auto-capture-window";

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
  refunded_at: string | null;
  issuance: PaymentIssuance | null;
}

/** 撈出某事務所的收款紀錄（含客戶名稱），依建立時間新到舊。 */
export async function getFirmPayments(
  requestedFirmId: string,
): Promise<FirmPaymentRow[]> {
  const { profile } = await requireStaff();
  const firmId = resolveFirmId(profile, requestedFirmId);

  const rows = await db
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
      refunded_at: ecpay_payments.refunded_at,
      issuance: ecpay_payments.issuance,
    })
    .from(ecpay_payments)
    .leftJoin(clients, eq(ecpay_payments.client_id, clients.id))
    .where(eq(ecpay_payments.firm_id, firmId))
    .orderBy(desc(ecpay_payments.created_at));

  // issuance 為 JSONB（Drizzle 型別為 unknown），對齊 FirmPaymentRow 的型別。
  return rows.map((r) => ({
    ...r,
    issuance: (r.issuance as PaymentIssuance | null) ?? null,
  }));
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

/**
 * 退款：由本 app 透過綠界 CreditDetail/DoAction（Action=R）對某筆已付款訂單退全額。
 * 成功後將該列改為 'refunded'，並記 refunded_amount / refunded_at。
 *
 * 為何由 app 發起：綠界後台「直接退款」不會回呼本系統（付款 ReturnURL 僅在原始付款
 * 時觸發一次），故唯有由 app 發起退款，本系統才會即時得知。退款請一律在 SnapBooks 操作。
 *
 * 注意：
 * - 僅信用卡（本系統收款一律 ChoosePayment=Credit）；DoAction 不支援 ATM/超商退款。
 * - DoAction 僅正式環境可實際執行（測試環境無真實授權，呼叫會失敗）。
 * - Action=R 在「要關帳」與「已關帳」狀態皆可退款（來源：綠界 2883 狀態機）。本帳戶為
 *   每日自動關帳，付款後即進入 要關帳→已關帳，故 R 一路適用，不需先請款。（若帳戶改為
 *   手動請款，已授權未關帳的訂單須先 C 請款或 N 放棄，屆時再擴充。）
 * - 每日自動關帳時段（台灣時間 20:15–20:30）綠界要求勿呼叫 DoAction，故此時段擋下退款。
 * - 退款金額不得超過原訂單；綠界帳戶餘額不足會被拒，RtnMsg 照實回報給操作者。
 */
export async function refundPayment(input: {
  firm_id: string;
  payment_id: string;
}): Promise<{ status: "refunded" }> {
  const { profile } = await requireStaff();
  const firmId = resolveFirmId(profile, input.firm_id);

  // 整段包在交易內並以 SELECT … FOR UPDATE 鎖住該列：並行退款時，後到的請求會在
  // 取鎖處阻塞，待前者 commit 後讀到 'refunded' 直接冪等返回，不會重複呼叫綠界
  // DoAction（避免第二次被綠界拒退後誤報「退款失敗」）。鎖跨越 DoAction HTTP 呼叫，
  // 對此低頻財務操作可接受。來源：ECPay skill §冪等建議（SELECT … FOR UPDATE）。
  await db.transaction(async (tx) => {
    // 限本 firm（Drizzle 繞過 RLS，需顯式把關）。
    const [payment] = await tx
      .select()
      .from(ecpay_payments)
      .where(
        and(
          eq(ecpay_payments.id, input.payment_id),
          eq(ecpay_payments.firm_id, firmId),
        ),
      )
      .for("update")
      .limit(1);

    if (!payment) throw new Error("找不到付款紀錄");
    // 並行請求已搶先退款：冪等視為成功，不再呼叫 DoAction。
    if (payment.status === "refunded") return;
    if (payment.status !== "paid") throw new Error("僅已付款的款項可退款");

    // 每日自動關帳時段綠界禁止呼叫 DoAction，於此時段擋下退款（server 端為權威把關）。
    if (isAutoCaptureBlackout()) {
      throw new Error(
        `綠界每日自動關帳時段（台灣時間 ${AUTO_CAPTURE_BLACKOUT_LABEL}）暫停退款，請於 20:30 後再試`,
      );
    }

    // TradeNo（綠界交易編號）留在 raw_payload；退款必填，缺漏代表資料異常。
    const rawPayload =
      payment.raw_payload && typeof payment.raw_payload === "object"
        ? (payment.raw_payload as Record<string, unknown>)
        : {};
    const tradeNo = rawPayload.TradeNo;
    if (!payment.merchant_trade_no || typeof tradeNo !== "string" || !tradeNo) {
      throw new Error("缺少綠界交易編號，無法退款");
    }

    const config = getEcpayConfig();
    const params = buildDoActionParams(
      {
        merchantId: config.merchantId,
        merchantTradeNo: payment.merchant_trade_no,
        tradeNo,
        action: "R",
        totalAmount: payment.amount, // v1 全額退款
      },
      config.credentials,
    );

    const response = await fetch(config.doActionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      cache: "no-store", // 財務 API 明確不快取
    });
    // 綠界 5xx 會回 HTML 錯誤頁，落到 parse 會被誤判為「退款失敗」。先擋 HTTP 失敗：
    // 此時退款是否生效未知，提示操作者至綠界後台確認，勿盲目重試（throw 會 rollback，
    // 狀態維持 paid 可重試）。
    if (!response.ok) {
      throw new Error(
        `無法連線綠界退款服務（HTTP ${response.status}），請稍後再試，或至綠界後台確認退款狀態`,
      );
    }
    const result = parseDoActionResponse(await response.text());

    if (!result.success) {
      console.error("[ecpay] 退款失敗", {
        paymentId: payment.id,
        merchantTradeNo: payment.merchant_trade_no,
        rtnCode: result.rtnCode,
        rtnMsg: result.rtnMsg,
      });
      throw new Error(`退款失敗：${result.rtnMsg || `綠界回應碼 ${result.rtnCode}`}`);
    }

    // 已持鎖且狀態確為 paid，WHERE 用 id 即可。status 以 EcpayPaymentStatus 約束
    // （schema.ts 為 drizzle-kit pull 產生檔，型別把關放寫入端；models.ts 為單一來源，
    // DB CHECK 為執行期防線）。
    const nextStatus: EcpayPaymentStatus = "refunded";
    await tx
      .update(ecpay_payments)
      .set({
        status: nextStatus,
        refunded_amount: payment.amount,
        refunded_at: new Date().toISOString(),
      })
      .where(eq(ecpay_payments.id, payment.id));
  });

  revalidatePath(`/firm/${firmId}/payment-link`);
  return { status: "refunded" };
}

/**
 * 標記某筆已付款收款的開立狀態（發票 / 收據 / 免開立），寫入 ecpay_payments.issuance。
 *
 * 這是追蹤性 metadata：真正憑證仍由 Amego 手動開立，此處只記錄「開了什麼、號碼與連結碼」。
 * 連結碼（order_id）建議寫在 Amego 的訂單編號欄，未來自動化時即沿用同一碼。
 * 可重複呼叫以更正（直接覆寫 kind/number/order_id），並保留既有 allowances（未來折讓用）。
 */
export async function markPaymentIssued(
  input: MarkPaymentIssuedInput,
): Promise<{ ok: true }> {
  const parsed = markPaymentIssuedSchema.parse(input);
  const { userId, profile } = await requireStaff();
  const firmId = resolveFirmId(profile, parsed.firm_id);

  const [payment] = await db
    .select()
    .from(ecpay_payments)
    .where(
      and(
        eq(ecpay_payments.id, parsed.payment_id),
        eq(ecpay_payments.firm_id, firmId),
      ),
    )
    .limit(1);

  if (!payment) throw new Error("找不到付款紀錄");
  // 僅實際收過款的訂單需要開立憑證（已退款者仍可記錄，便於日後折讓對帳）。
  if (payment.status !== "paid" && payment.status !== "refunded") {
    throw new Error("僅已付款的款項可記錄開立");
  }

  const existing = (payment.issuance as PaymentIssuance | null) ?? null;
  const issuance: PaymentIssuance = {
    kind: parsed.kind,
    // 免開立不帶連結碼／號碼。
    ...(parsed.kind !== "none" && parsed.order_id
      ? { order_id: parsed.order_id }
      : {}),
    ...(parsed.kind !== "none" && parsed.number
      ? { number: parsed.number }
      : {}),
    issued_at: new Date().toISOString(),
    issued_by: userId,
    // 保留既有折讓紀錄（更正開立資訊不應丟失已開的折讓）。
    ...(existing?.allowances ? { allowances: existing.allowances } : {}),
  };

  await db
    .update(ecpay_payments)
    .set({ issuance: paymentIssuanceSchema.parse(issuance) })
    .where(eq(ecpay_payments.id, payment.id));

  revalidatePath(`/firm/${firmId}/payment-link`);
  return { ok: true };
}

/** 清除開立紀錄，回到「待開立」（用於誤標）。 */
export async function clearPaymentIssuance(input: {
  firm_id: string;
  payment_id: string;
}): Promise<{ ok: true }> {
  const { profile } = await requireStaff();
  const firmId = resolveFirmId(profile, input.firm_id);

  const result = await db
    .update(ecpay_payments)
    .set({ issuance: null })
    .where(
      and(
        eq(ecpay_payments.id, input.payment_id),
        eq(ecpay_payments.firm_id, firmId),
      ),
    )
    .returning({ id: ecpay_payments.id });

  if (result.length === 0) throw new Error("找不到付款紀錄");

  revalidatePath(`/firm/${firmId}/payment-link`);
  return { ok: true };
}

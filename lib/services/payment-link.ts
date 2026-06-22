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
  type CreatePaymentLinkInput,
  type EcpayPaymentStatus,
} from "@/lib/domain/models";
import { getEcpayConfig } from "@/lib/services/ecpay/config";
import {
  buildDoActionParams,
  parseDoActionResponse,
  isUncapturedFullRefundError,
  describeDoActionFailure,
  type DoActionType,
  type DoActionResult,
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
      refunded_at: ecpay_payments.refunded_at,
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
 * - 整筆退款依訂單關帳狀態走兩條路（來源：綠界 2883 狀態機、2885 請退款功能）：
 *     • 已關帳：Action=R 退刷全額。
 *     • 要關帳（尚未關帳）：整筆 R 會被綠界回拒（更新失敗，實測 token `error_amount_R`；
 *       該狀態 R 只能部分退），故改走 取消關帳(E)→放棄授權(N)；授權未請款，款項不會入帳，
 *       效果等同全額退款。判斷見 isUncapturedFullRefundError（放寬比對，誤判仍安全）。
 *   本帳戶為每日自動關帳，付款當日（20:15–20:30 關帳前）退款落在要關帳情境，故需自動 fallback。
 * - 每日自動關帳時段（台灣時間 20:15–20:30）綠界要求勿呼叫 DoAction，故此時段擋下退款。
 * - 退款金額不得超過原訂單；綠界帳戶餘額不足會被拒，失敗時回報操作者可行動的訊息。
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

    // 全額退款（v1 只做全額）。merchant_trade_no / tradeNo 已於上方驗證為非空。
    const doAction = async (action: DoActionType): Promise<DoActionResult> => {
      const params = buildDoActionParams(
        {
          merchantId: config.merchantId,
          merchantTradeNo: payment.merchant_trade_no as string,
          tradeNo,
          action,
          totalAmount: payment.amount,
        },
        config.credentials,
      );
      const response = await fetch(config.doActionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params).toString(),
        cache: "no-store", // 財務 API 明確不快取
      });
      // 綠界 5xx 會回 HTML 錯誤頁，落到 parse 會被誤判為失敗。先擋 HTTP 失敗：此時退款
      // 是否生效未知，提示操作者至綠界後台確認，勿盲目重試（throw 會 rollback，狀態維持 paid）。
      if (!response.ok) {
        throw new Error(
          `無法連線綠界退款服務（HTTP ${response.status}），請稍後再試，或至綠界廠商後台確認退款狀態`,
        );
      }
      return parseDoActionResponse(await response.text());
    };

    const logFailure = (result: DoActionResult, action: DoActionType) => {
      console.error("[ecpay] 退款失敗", {
        paymentId: payment.id,
        merchantTradeNo: payment.merchant_trade_no,
        action,
        rtnCode: result.rtnCode,
        rtnMsg: result.rtnMsg,
      });
    };

    // 先嘗試退刷（Action=R）。已關帳訂單整筆退款走這條；要關帳訂單會被回拒，下方 fallback 接手。
    const result = await doAction("R");
    // 退款實際採用的動作（供稽核；要關帳訂單會改走 E→N）。
    let refundAction: "R" | "E+N" = "R";

    if (!result.success && isUncapturedFullRefundError(result)) {
      // 要關帳訂單整筆退款：取消關帳(E)→放棄授權(N)。授權未請款，款項不會入帳。
      const cancel = await doAction("E");
      if (!cancel.success) {
        // E 失敗代表綠界端未變動，rollback 後維持 paid 可重試。
        logFailure(cancel, "E");
        throw new Error(describeDoActionFailure(cancel));
      }
      // E 成功＝這筆款項不會被請款入帳，退款已實質生效。N（放棄授權）僅為釋放剩餘授權額度
      // 的善後：成敗都不影響「不會入帳」的結果，故 N 一律不得 rollback（否則 DB 退回 paid 與
      // 綠界實況不符，且重試時訂單已非要關帳，會走錯路徑）。doAction 在 fetch/HTTP 失敗時會
      // throw，故整段以 try/catch 包住，例外只記 log、不外傳。
      try {
        const abandon = await doAction("N");
        if (!abandon.success) logFailure(abandon, "N");
      } catch (err) {
        console.error("[ecpay] 放棄授權(N) 發生例外，僅記錄不影響退款結果", {
          paymentId: payment.id,
          merchantTradeNo: payment.merchant_trade_no,
          err,
        });
      }
      refundAction = "E+N";
    } else if (!result.success) {
      logFailure(result, "R");
      throw new Error(describeDoActionFailure(result));
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
        // 留下退款實際採用的動作（R 退刷／E+N 取消未關帳授權）供日後對帳稽核。
        raw_payload: { ...rawPayload, refund_action: refundAction },
      })
      .where(eq(ecpay_payments.id, payment.id));
  });

  revalidatePath(`/firm/${firmId}/payment-link`);
  return { status: "refunded" };
}

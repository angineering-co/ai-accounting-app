import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { ecpay_payments } from "@/lib/db/schema";
import { getEcpayConfig } from "@/lib/services/ecpay/config";
import { parseAioReturn } from "@/lib/services/ecpay/callback";
import type { EcpayPaymentStatus } from "@/lib/domain/models";

const PLAIN_TEXT = { "Content-Type": "text/plain" } as const;

/**
 * 綠界 AIO ReturnURL 回呼（信用卡一次付清）。server-to-server Form POST，是付款
 * 結果的**權威來源**。驗 CheckMacValue → 以 checkout_token（CustomField1）冪等更新
 * → 回 `1|OK`。對帳鍵用 checkout_token 而非 MerchantTradeNo，因為每次開啟 checkout
 * 都會換新的 MTN，唯有 checkout_token 穩定（不論哪次嘗試成交都對得回同一筆）。
 *
 * 回應規則：綠界要求純文字 `1|OK`，否則每 5–15 分鐘重送（每日上限 4 次）。
 * - CheckMacValue 驗證失敗：刻意回非 200，讓綠界於重試窗口內重送（真實回呼必定
 *   驗證通過；偽造請求本就該拒絕）。比「失敗也回 1|OK」更安全，且我方若有 bug 仍有
 *   補收機會。
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) params[key] = String(value);

  let credentials;
  try {
    credentials = getEcpayConfig().credentials;
  } catch {
    // 環境變數缺漏屬部署問題：回非 200 讓綠界重送，補好設定後仍可收。
    return new NextResponse("0|config", { status: 500, headers: PLAIN_TEXT });
  }

  const result = parseAioReturn(params, credentials);

  if (!result.valid) {
    console.error("[ecpay] ReturnURL CheckMacValue 驗證失敗", {
      merchantTradeNo: result.merchantTradeNo,
    });
    return new NextResponse("0|CheckMacValue", {
      status: 400,
      headers: PLAIN_TEXT,
    });
  }

  // 對帳鍵是 checkout_token（建單時放進 CustomField1，綠界原樣回傳）。v1 一律帶，
  // 故缺漏只代表異常——留 log，不更新。
  if (result.checkoutToken) {
    const nextStatus: EcpayPaymentStatus = result.success ? "paid" : "failed";

    // 僅在 status='pending' 時更新：重複/遲到回呼具冪等性，不覆寫已結案的列。
    // 同時把這次「實際成交」的 MerchantTradeNo 回寫（退款/查詢時需要）。
    const updated = await db
      .update(ecpay_payments)
      .set({
        status: nextStatus,
        merchant_trade_no: result.merchantTradeNo || null,
        gwsr: result.gwsr,
        card4no: result.card4no,
        charged_at: result.success ? result.paidAt : null,
        raw_payload: params,
      })
      .where(
        and(
          eq(ecpay_payments.checkout_token, result.checkoutToken),
          eq(ecpay_payments.status, "pending"),
        ),
      )
      .returning({ id: ecpay_payments.id });

    // 成功回呼卻沒更新到任何 pending 列：可能是綠界重送（已處理），也可能是同一筆
    // 在另一分頁被重複付款（並行雙刷）。留下軌跡，偵測/退款於後續階段處理。
    if (result.success && updated.length === 0) {
      console.warn("[ecpay] 成功回呼但無 pending 列可更新（重送或並行重複付款？）", {
        checkoutToken: result.checkoutToken,
        merchantTradeNo: result.merchantTradeNo,
        tradeNo: result.tradeNo,
      });
    }
  } else {
    console.error("[ecpay] ReturnURL 缺少 CustomField1（checkout_token），無法對帳", {
      merchantTradeNo: result.merchantTradeNo,
      tradeNo: result.tradeNo,
    });
  }

  // 查無此單或已結案都回 1|OK，避免綠界持續重送。
  return new NextResponse("1|OK", { status: 200, headers: PLAIN_TEXT });
}

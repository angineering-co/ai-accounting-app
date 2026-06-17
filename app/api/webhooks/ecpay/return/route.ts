import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { ecpay_payments } from "@/lib/db/schema";
import { getEcpayConfig } from "@/lib/services/ecpay/config";
import { parseAioReturn } from "@/lib/services/ecpay/callback";

const PLAIN_TEXT = { "Content-Type": "text/plain" } as const;

/**
 * 綠界 AIO ReturnURL 回呼（信用卡一次付清）。server-to-server Form POST，是付款
 * 結果的**權威來源**。驗 CheckMacValue → 以 merchant_trade_no 冪等更新 → 回 `1|OK`。
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

  if (result.merchantTradeNo) {
    const nextStatus = result.success ? "paid" : "failed";

    // 僅在 status='pending' 時更新：重複回呼（綠界重送）具冪等性，不會覆寫已結案的列。
    await db
      .update(ecpay_payments)
      .set({
        status: nextStatus,
        gwsr: result.gwsr,
        card4no: result.card4no,
        charged_at: result.success ? result.paidAt : null,
        raw_payload: params,
      })
      .where(
        and(
          eq(ecpay_payments.merchant_trade_no, result.merchantTradeNo),
          eq(ecpay_payments.status, "pending"),
        ),
      );
  }

  // 查無此單或已結案都回 1|OK，避免綠界持續重送。
  return new NextResponse("1|OK", { status: 200, headers: PLAIN_TEXT });
}

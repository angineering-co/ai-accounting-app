import { PRICES, REGISTRATION_PRICING_NOTE, LINE_URL } from "@/lib/pricing";
import type { ApplyFormPath } from "@/lib/actions/apply";

export interface LeadFollowupParams {
  path: ApplyFormPath;
  contactName: string;
  leadCode: string;
  /** The form fields the lead just submitted (the leads.data JSONB). */
  submission: Record<string, unknown>;
}

/**
 * zh-Hant labels for the captured form fields. Only keys listed here are shown
 * in the submission summary, so internal/unknown keys never leak into the email.
 */
const FIELD_LABELS: Record<string, string> = {
  contactName: "聯絡人姓名",
  email: "電子信箱",
  phone: "聯絡電話",
  companyName: "公司名稱",
  taxId: "統一編號",
  companyType: "公司型態",
  companyNames: "期望公司名稱",
  businessDescription: "主要業務簡述",
  capitalAmount: "預計資本額",
  shareholderCount: "股東人數",
  addressSituation: "登記地址",
  articlesOfIncorporation: "章程",
  currentAccounting: "目前記帳方式",
  monthlyInvoiceVolume: "每月發票量",
  notes: "備註",
};

/** Display order for the summary rows (keys not present are skipped). */
const FIELD_ORDER = [
  "contactName",
  "email",
  "phone",
  "companyName",
  "taxId",
  "companyType",
  "companyNames",
  "businessDescription",
  "capitalAmount",
  "shareholderCount",
  "addressSituation",
  "articlesOfIncorporation",
  "currentAccounting",
  "monthlyInvoiceVolume",
  "notes",
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v).trim())
      .filter(Boolean)
      .join("、");
  }
  return String(value).trim();
}

function renderSubmissionRows(submission: Record<string, unknown>): string {
  return FIELD_ORDER.filter((key) => key in submission && submission[key] != null)
    .map((key) => ({ label: FIELD_LABELS[key], value: formatValue(submission[key]) }))
    .filter((row) => row.value !== "")
    .map(
      ({ label, value }) => `
            <tr>
              <td style="padding: 6px 12px 6px 0; font-size: 14px; color: #94a3b8; white-space: nowrap; vertical-align: top;">${escapeHtml(label)}</td>
              <td style="padding: 6px 0; font-size: 15px; color: #334155;">${escapeHtml(value)}</td>
            </tr>`,
    )
    .join("");
}

/** Services + pricing copy, branched by the lead's selected path. */
function renderServicePricing(path: ApplyFormPath): string {
  const bookkeepingLine = `記帳報稅：每月 NT$${PRICES.annual.toLocaleString()}（年繳）／ NT$${PRICES.monthly.toLocaleString()}（月繳）`;

  if (path === "registration") {
    return `
          <p style="margin: 0 0 8px; font-size: 16px; color: #475569;">
            我們協助您一次完成<strong>公司設立登記</strong>與後續<strong>記帳報稅</strong>，設立完成後只需簽署記帳委任合約即可無縫銜接。
          </p>
          <ul style="margin: 0 0 8px; padding-left: 20px; font-size: 16px; color: #475569;">
            <li>設立登記：${escapeHtml(REGISTRATION_PRICING_NOTE)}</li>
            <li>${escapeHtml(bookkeepingLine)}</li>
          </ul>`;
  }

  return `
          <p style="margin: 0 0 8px; font-size: 16px; color: #475569;">
            我們提供<strong>線上委託記帳報稅</strong>服務，並透過線上平台讓您隨時查看進度、上傳憑證、下載報稅文件，省去郵寄或親送的麻煩。
          </p>
          <ul style="margin: 0 0 8px; padding-left: 20px; font-size: 16px; color: #475569;">
            <li>${escapeHtml(bookkeepingLine)}</li>
          </ul>`;
}

export function buildLeadFollowupEmail({
  path,
  contactName,
  leadCode,
  submission,
}: LeadFollowupParams): { subject: string; html: string } {
  const subject = "感謝您的申請 — 加入 LINE 完成下一步｜SnapBooks.ai 速博";
  const greetingName = contactName?.trim() || "您好";
  const summaryRows = renderSubmissionRows(submission);

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>感謝您的申請｜SnapBooks.ai 速博</title>
  </head>
  <body
    style="
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #f8fafc;
      color: #334155;
      line-height: 1.6;
    "
  >
    <div style="max-width: 600px; margin: 0 auto; padding: 40px 24px;">
      <div
        style="
          background: white;
          border-radius: 16px;
          padding: 40px 32px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
          border: 1px solid #e2e8f0;
        "
      >
        <h2 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">
          ${escapeHtml(greetingName)}，感謝您的申請！
        </h2>
        <p style="margin: 0 0 24px; font-size: 16px; color: #475569;">
          我們已收到您的申請。完成下方「加入 LINE」步驟後，我們會盡快與您聯繫。
        </p>

        <h3 style="margin: 0 0 12px; font-size: 17px; font-weight: 700; color: #0f172a;">服務與費用</h3>
        ${renderServicePricing(path)}
        <p style="margin: 0 0 24px; font-size: 14px; color: #94a3b8;">
          費用說明：不論月繳或年繳，每年皆收取 13 個月（第 13 個月為年度結算報稅費用）。
        </p>

        ${
          summaryRows
            ? `<h3 style="margin: 0 0 12px; font-size: 17px; font-weight: 700; color: #0f172a;">您填寫的資料</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 0 0 24px;">
          <tbody>${summaryRows}
          </tbody>
        </table>`
            : ""
        }

        <div style="border-top: 1px solid #e2e8f0; margin: 24px 0;"></div>

        <h3 style="margin: 0 0 12px; font-size: 17px; font-weight: 700; color: #0f172a;">下一步：加入 LINE 好友</h3>
        <ol style="margin: 0 0 16px; padding-left: 20px; font-size: 16px; color: #475569;">
          <li>點擊下方按鈕，加入速博 LINE 官方帳號</li>
          <li>傳送您的專屬代碼給我們</li>
          <li>我們會盡快與您聯繫！</li>
        </ol>

        <p style="margin: 0 0 8px; font-size: 16px; color: #475569;">您的專屬代碼：</p>
        <p style="margin: 0 0 24px;">
          <span style="display: inline-block; padding: 12px 20px; background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 22px; font-weight: 700; letter-spacing: 0.08em; color: #047857;">
            ${escapeHtml(leadCode)}
          </span>
        </p>

        <p style="margin: 0;">
          <a
            href="${LINE_URL}"
            style="
              display: inline-block;
              padding: 14px 28px;
              background-color: #06C755;
              color: white;
              font-size: 16px;
              font-weight: 600;
              text-decoration: none;
              border-radius: 9999px;
              box-shadow: 0 4px 14px rgba(6, 199, 85, 0.25);
            "
          >
            加入 LINE 好友
          </a>
        </p>

        <p style="margin: 24px 0 0; font-size: 14px; color: #94a3b8;">
          SnapBooks.ai 速博智慧有限公司
        </p>
      </div>
    </div>
  </body>
</html>`;

  return { subject, html };
}

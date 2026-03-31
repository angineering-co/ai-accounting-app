import {
  getNationalityLabel,
  fmtCurrency as fmt,
  fmtPercent as pct,
  type Nationality,
  type LaborResult,
} from "./withholding-tax";

export type LaborReportPdfInput = Pick<
  LaborResult,
  | "incomeCategoryLabel"
  | "professionLabel"
  | "expenseRate"
  | "grossAmount"
  | "withholdingTax"
  | "healthInsurance"
  | "netAmount"
> & {
  nationality: Nationality;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildFormHtml(input: LaborReportPdfInput): string {
  return `
<div style="font-family:'Noto Sans TC','Microsoft JhengHei','PingFang TC',sans-serif;font-size:13px;color:#111;padding:40px;width:794px;background:#fff;">
  <h1 style="text-align:center;font-size:22px;font-weight:700;margin:0 0 16px;letter-spacing:4px;">勞務報酬單</h1>
  <table style="width:100%;border-collapse:collapse;border:2px solid #111;">
    <tr>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;width:90px;">姓名</td>
      <td style="border:1px solid #111;padding:8px 10px;" colspan="3"></td>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;width:70px;">國籍</td>
      <td style="border:1px solid #111;padding:8px 10px;" colspan="2">${esc(getNationalityLabel(input.nationality))}</td>
    </tr>
    <tr>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;">身分證或護照號</td>
      <td style="border:1px solid #111;padding:8px 10px;" colspan="6"></td>
    </tr>
    <tr>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;">連絡電話</td>
      <td style="border:1px solid #111;padding:8px 10px;" colspan="2"></td>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;">戶籍地址</td>
      <td style="border:1px solid #111;padding:8px 10px;" colspan="3"></td>
    </tr>
    <tr>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;">勞務內容</td>
      <td style="border:1px solid #111;padding:8px 10px;" colspan="3"></td>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;">勞務期間</td>
      <td style="border:1px solid #111;padding:8px 10px;text-align:center;" colspan="2">~</td>
    </tr>
    <tr>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;">所得類別</td>
      <td style="border:1px solid #111;padding:8px 10px;" colspan="2">${esc(input.incomeCategoryLabel)}</td>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;">執行業務類別</td>
      <td style="border:1px solid #111;padding:8px 10px;" colspan="3">${esc(input.professionLabel)} - 費用率:${pct(input.expenseRate)}</td>
    </tr>
    <tr>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;">應付金額</td>
      <td style="border:1px solid #111;padding:8px 10px;font-family:'Courier New',monospace;font-size:15px;font-weight:700;text-align:right;">${fmt(input.grossAmount)}</td>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;">代扣稅額</td>
      <td style="border:1px solid #111;padding:8px 10px;font-family:'Courier New',monospace;font-size:15px;font-weight:700;text-align:right;">${fmt(input.withholdingTax)}</td>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;">健保金額</td>
      <td style="border:1px solid #111;padding:8px 10px;font-family:'Courier New',monospace;font-size:15px;font-weight:700;text-align:right;">${fmt(input.healthInsurance)}</td>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;">實付金額</td>
    </tr>
    <tr>
      <td style="border:1px solid #111;padding:10px 16px;font-family:'Courier New',monospace;font-size:18px;font-weight:700;text-align:right;" colspan="7">${fmt(input.netAmount)}</td>
    </tr>
    <tr>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;">付款方式</td>
      <td style="border:1px solid #111;padding:8px 10px;"></td>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;">銀行代號</td>
      <td style="border:1px solid #111;padding:8px 10px;"></td>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;" colspan="1">帳號</td>
      <td style="border:1px solid #111;padding:8px 10px;" colspan="2"></td>
    </tr>
    <tr>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;">存摺</td>
      <td style="border:1px solid #111;padding:8px 10px;" colspan="6"></td>
    </tr>
    <tr>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;" rowspan="2">簽名</td>
      <td style="border:1px solid #111;padding:8px 10px;height:60px;" colspan="3" rowspan="2"></td>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;">報酬單編號</td>
      <td style="border:1px solid #111;padding:8px 10px;" colspan="2"></td>
    </tr>
    <tr>
      <td style="border:1px solid #111;padding:8px 10px;background:#f9f9f9;font-weight:600;">日期</td>
      <td style="border:1px solid #111;padding:8px 10px;" colspan="2"></td>
    </tr>
    <tr>
      <td style="border:1px solid #111;padding:10px;text-align:center;font-weight:700;font-size:14px;background:#f3f3f3;" colspan="7">身分證正反面黏貼處</td>
    </tr>
  </table>
  <table style="width:100%;border-collapse:collapse;border:2px solid #111;border-top:none;">
    <tr>
      <td style="border:1px solid #111;width:50%;height:280px;text-align:center;vertical-align:bottom;padding-bottom:12px;font-size:12px;color:#666;">身分證正面黏貼處</td>
      <td style="border:1px solid #111;width:50%;height:280px;text-align:center;vertical-align:bottom;padding-bottom:12px;font-size:12px;color:#666;">身分證背面黏貼處</td>
    </tr>
  </table>
  <div style="margin-top:12px;text-align:center;font-size:10px;color:#999;">Powered By SnapBooks.ai</div>
</div>`;
}

export async function generateLaborReportPdf(
  input: LaborReportPdfInput,
): Promise<void> {
  const [{ default: jsPDF }, html2canvasModule] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const html2canvas = html2canvasModule.default;

  // Create off-screen container with the form content
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.zIndex = "-1";
  container.innerHTML = buildFormHtml(input);
  document.body.appendChild(container);

  // The renderable element is the first child div
  const target = container.firstElementChild as HTMLElement;

  try {
    // Wait for fonts to load
    await document.fonts.ready;

    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);

    const today = new Date().toISOString().slice(0, 10);
    pdf.save(`勞務報酬單_${today}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

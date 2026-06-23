import { describe, it, expect } from "vitest";
import { buildLeadFollowupEmail } from "./lead-followup";
import { PRICES, REGISTRATION_PRICING_NOTE, LINE_URL } from "@/lib/pricing";

describe("buildLeadFollowupEmail", () => {
  const leadCode = "SB-AB23-CD45";

  it("bookkeeping email includes pricing, billing note, code, LINE URL and submitted fields", () => {
    const { subject, html } = buildLeadFollowupEmail({
      path: "bookkeeping",
      contactName: "王小明",
      leadCode,
      submission: {
        contactName: "王小明",
        email: "wang@example.com",
        phone: "0912345678",
        companyName: "小明商行",
        taxId: "12345678",
      },
    });

    expect(subject).toContain("SnapBooks");
    expect(html).toContain("王小明");
    expect(html).toContain(leadCode);
    expect(html).toContain(LINE_URL);
    // 記帳 pricing from constants
    expect(html).toContain(`NT$${PRICES.annual.toLocaleString()}`);
    expect(html).toContain(`NT$${PRICES.monthly.toLocaleString()}`);
    // 13-month billing note
    expect(html).toContain("13 個月");
    // submitted fields echoed back with labels
    expect(html).toContain("您填寫的資料");
    expect(html).toContain("公司名稱");
    expect(html).toContain("小明商行");
    expect(html).toContain("統一編號");
    expect(html).toContain("12345678");
    // bookkeeping path should not show the registration pricing note
    expect(html).not.toContain(REGISTRATION_PRICING_NOTE);
  });

  it("registration email includes setup pricing note and joins array fields", () => {
    const { html } = buildLeadFollowupEmail({
      path: "registration",
      contactName: "李大華",
      leadCode,
      submission: {
        contactName: "李大華",
        email: "lee@example.com",
        phone: "0987654321",
        companyType: "有限公司",
        companyNames: ["大華科技", "華大科技", ""],
      },
    });

    expect(html).toContain(REGISTRATION_PRICING_NOTE);
    // 記帳 pricing still shown alongside setup
    expect(html).toContain(`NT$${PRICES.annual.toLocaleString()}`);
    expect(html).toContain("13 個月");
    expect(html).toContain(leadCode);
    expect(html).toContain(LINE_URL);
    // array joined with 、 and empty entries dropped
    expect(html).toContain("大華科技、華大科技");
    expect(html).not.toContain("大華科技、華大科技、");
  });

  it("drops null/undefined/empty entries from array fields", () => {
    const { html } = buildLeadFollowupEmail({
      path: "registration",
      contactName: "測試",
      leadCode,
      submission: {
        companyNames: ["大華科技", null, undefined, "", "華大科技"],
      },
    });

    expect(html).toContain("大華科技、華大科技");
    expect(html).not.toContain("null");
    expect(html).not.toContain("undefined");
  });

  it("escapes HTML in submitted values and omits unknown keys", () => {
    const { html } = buildLeadFollowupEmail({
      path: "bookkeeping",
      contactName: "Tester",
      leadCode,
      submission: {
        companyName: "<script>alert(1)</script>",
        turnstileToken: "should-not-appear",
        secretInternal: "leak",
      },
    });

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("should-not-appear");
    expect(html).not.toContain("leak");
  });
});

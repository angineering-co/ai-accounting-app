import { describe, it, expect } from "vitest";
import { isAutoCaptureBlackout } from "./auto-capture-window";

// 台灣時間 20:15 = UTC 12:15。以已知 UTC 瞬間驗證台灣時區換算與邊界。
describe("isAutoCaptureBlackout", () => {
  it("20:15（台灣）起進入自動關帳時段", () => {
    expect(isAutoCaptureBlackout(new Date("2026-06-18T12:15:00Z"))).toBe(true);
  });

  it("20:14（台灣）尚未進入", () => {
    expect(isAutoCaptureBlackout(new Date("2026-06-18T12:14:59Z"))).toBe(false);
  });

  it("20:30（台灣）仍在時段內（含邊界）", () => {
    expect(isAutoCaptureBlackout(new Date("2026-06-18T12:30:00Z"))).toBe(true);
  });

  it("20:31（台灣）已離開時段", () => {
    expect(isAutoCaptureBlackout(new Date("2026-06-18T12:31:00Z"))).toBe(false);
  });

  it("白天時段不受影響", () => {
    expect(isAutoCaptureBlackout(new Date("2026-06-18T06:00:00Z"))).toBe(false);
  });
});

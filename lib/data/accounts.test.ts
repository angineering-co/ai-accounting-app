import { describe, expect, it } from "vitest";
import { ACCOUNT_LIST, extractAccountCode } from "./accounts";

describe("extractAccountCode", () => {
  it("extracts 4-digit code with single half-width space", () => {
    expect(extractAccountCode("5102 旅費")).toBe("5102");
    expect(extractAccountCode("1111 現金")).toBe("1111");
    expect(extractAccountCode("4101 營業收入")).toBe("4101");
  });

  it("extracts 6-digit subcategory code", () => {
    expect(extractAccountCode("119901 應退稅額")).toBe("119901");
    expect(extractAccountCode("613201 什費")).toBe("613201");
  });

  it("splits on the first space when name contains additional spaces", () => {
    expect(extractAccountCode("5102 旅 費")).toBe("5102");
  });

  it("throws when no space separator is present", () => {
    expect(() => extractAccountCode("5102旅費")).toThrow(/missing space/i);
    expect(() => extractAccountCode("5102")).toThrow(/missing space/i);
    expect(() => extractAccountCode("")).toThrow(/missing space/i);
  });

  it("throws when prefix is not 4–6 digits", () => {
    expect(() => extractAccountCode("abc 旅費")).toThrow(/4–6 digits/);
    expect(() => extractAccountCode("123 旅費")).toThrow(/4–6 digits/);
    expect(() => extractAccountCode("1234567 旅費")).toThrow(/4–6 digits/);
    expect(() => extractAccountCode(" 5102 旅費")).toThrow(/4–6 digits/);
  });

  it("round-trips every ACCOUNT_LIST entry", () => {
    for (const entry of ACCOUNT_LIST) {
      const code = extractAccountCode(entry);
      expect(entry.startsWith(`${code} `)).toBe(true);
    }
  });
});

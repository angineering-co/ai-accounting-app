import { describe, it, expect } from "vitest";
import { isValidUBN, isBusinessBuyer } from "./tax-id";

describe("isValidUBN", () => {
  it("returns false for non-8-digit strings", () => {
    expect(isValidUBN("")).toBe(false);
    expect(isValidUBN("1234567")).toBe(false);
    expect(isValidUBN("123456789")).toBe(false);
    expect(isValidUBN("abcdefgh")).toBe(false);
    expect(isValidUBN("1234 678")).toBe(false);
  });

  it("validates known valid UBNs", () => {
    // Government example
    expect(isValidUBN("04595257")).toBe(true);
    // Well-known companies
    expect(isValidUBN("53212539")).toBe(true);
    expect(isValidUBN("24549210")).toBe(true);
  });

  it("rejects known invalid UBNs", () => {
    expect(isValidUBN("12345678")).toBe(false);
    expect(isValidUBN("11111111")).toBe(false);
    expect(isValidUBN("99999999")).toBe(false);
  });

  it("handles the special case when digit at position 6 is 7", () => {
    // UBN with 7 at position 6 where (sum+1)%5===0
    expect(isValidUBN("10458570")).toBe(true);
    expect(isValidUBN("10458575")).toBe(true);
  });
});

describe("isBusinessBuyer", () => {
  it("is true only for a valid 統編", () => {
    expect(isBusinessBuyer("04595257")).toBe(true);
    expect(isBusinessBuyer("53212539")).toBe(true);
  });

  it("treats missing / placeholder / malformed buyer IDs as B2C", () => {
    expect(isBusinessBuyer(null)).toBe(false);
    expect(isBusinessBuyer(undefined)).toBe(false);
    expect(isBusinessBuyer("")).toBe(false);
    expect(isBusinessBuyer("0000000000")).toBe(false); // 10-zero B2C placeholder
    expect(isBusinessBuyer("12345678")).toBe(false); // bad checksum
  });
});

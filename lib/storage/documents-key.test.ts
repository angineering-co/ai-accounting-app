import { describe, it, expect } from "vitest";
import { toDocumentsKey } from "./documents-key";

const FIRM = "11111111-1111-1111-1111-111111111111";
const CLIENT = "22222222-2222-2222-2222-222222222222";
const FILE = "33333333-3333-3333-3333-333333333333.pdf";

describe("toDocumentsKey", () => {
  it("reorders an old-layout path (firm/period/client/file)", () => {
    expect(toDocumentsKey(`${FIRM}/11409/${CLIENT}/${FILE}`)).toBe(
      `${FIRM}/${CLIENT}/11409/${FILE}`,
    );
  });

  it("is idempotent on a new-layout path (firm/client/period/file)", () => {
    const newLayout = `${FIRM}/${CLIENT}/11409/${FILE}`;
    expect(toDocumentsKey(newLayout)).toBe(newLayout);
  });

  it("applying twice yields the same result", () => {
    const once = toDocumentsKey(`${FIRM}/11409/${CLIENT}/${FILE}`);
    expect(toDocumentsKey(once)).toBe(once);
  });

  it("throws when the path does not have 4 segments", () => {
    expect(() => toDocumentsKey(`${FIRM}/11409/${FILE}`)).toThrow(
      /4 segments/,
    );
    expect(() => toDocumentsKey(`${FIRM}/${CLIENT}/11409/extra/${FILE}`)).toThrow(
      /4 segments/,
    );
  });

  it("throws when no segment looks like a period", () => {
    expect(() => toDocumentsKey(`${FIRM}/${CLIENT}/${CLIENT}/${FILE}`)).toThrow(
      /period segment/,
    );
  });
});

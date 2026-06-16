import { describe, it, expect } from "vitest";
import { getImportFileMimeType, isHeicFilename } from "./mime-type";

const blob = (type: string) => new Blob(["x"], { type });

describe("isHeicFilename", () => {
  it("matches .heic/.heif case-insensitively", () => {
    expect(isHeicFilename("IMG_1234.HEIC")).toBe(true);
    expect(isHeicFilename("photo.heif")).toBe(true);
  });

  it("rejects other formats and empty input", () => {
    expect(isHeicFilename("scan.jpg")).toBe(false);
    expect(isHeicFilename("doc.pdf")).toBe(false);
    expect(isHeicFilename(null)).toBe(false);
    expect(isHeicFilename(undefined)).toBe(false);
  });
});

describe("getImportFileMimeType", () => {
  it("prefers a valid blob content-type", () => {
    expect(getImportFileMimeType(blob("image/png"), "photo.png")).toBe(
      "image/png"
    );
  });

  it("accepts HEIC/HEIF by blob content-type (supported by Gemini)", () => {
    expect(getImportFileMimeType(blob("image/heic"), "photo.heic")).toBe(
      "image/heic"
    );
    expect(getImportFileMimeType(blob("image/heif"), "photo.heif")).toBe(
      "image/heif"
    );
  });

  it("falls back to the extension when the blob type is missing", () => {
    // Some browsers report an empty type for .heic files.
    expect(getImportFileMimeType(blob(""), "IMG_1234.HEIC")).toBe("image/heic");
    expect(getImportFileMimeType(blob(""), "IMG_1234.heif")).toBe("image/heif");
  });

  it("falls back to the extension when the blob type is octet-stream", () => {
    expect(
      getImportFileMimeType(blob("application/octet-stream"), "scan.jpg")
    ).toBe("image/jpeg");
  });

  it("throws on genuinely unsupported formats", () => {
    expect(() => getImportFileMimeType(blob(""), "notes.txt")).toThrow(
      /Unsupported file format/
    );
  });
});

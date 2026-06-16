/**
 * Get MIME type from a Blob and filename.
 * Prefers the Blob's content-type if valid, falls back to extension-based detection.
 */
export function getImportFileMimeType(blob: Blob, filename: string): string {
  // First, try to use the Blob's content-type if available and valid
  if (blob.type && blob.type !== "application/octet-stream") {
    const supportedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/heic",
      "image/heif",
    ];
    if (supportedTypes.includes(blob.type)) {
      return blob.type;
    }
  }

  // Fallback to extension-based detection
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
  };

  const detectedType = mimeTypes[ext || ""];
  if (!detectedType) {
    throw new Error(
      `Unsupported file format: ${ext || "unknown"}. ` +
        `Supported formats: PDF, PNG, JPEG, GIF, WEBP, HEIC, HEIF.`
    );
  }

  return detectedType;
}

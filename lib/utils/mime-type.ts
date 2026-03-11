/**
 * Get MIME type from a Blob and filename.
 * Prefers the Blob's content-type if valid, falls back to extension-based detection.
 */
export function getMimeType(blob: Blob, filename: string): string {
  // First, try to use the Blob's content-type if available and valid
  if (blob.type && blob.type !== "application/octet-stream") {
    const supportedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
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
  };

  // Special handling for HEIC/HEIF - not supported by Gemini
  if (ext === "heic" || ext === "heif") {
    throw new Error(
      `HEIC/HEIF format is not supported by Gemini API. ` +
        `Please convert your image to JPEG or PNG format before uploading. ` +
        `You can use online converters or image editing software to convert the file.`
    );
  }

  const detectedType = mimeTypes[ext || ""];
  if (!detectedType) {
    throw new Error(
      `Unsupported file format: ${ext || "unknown"}. ` +
        `Supported formats: PDF, PNG, JPEG, GIF, WEBP. ` +
        `For HEIC files, please convert to JPEG or PNG first.`
    );
  }

  return detectedType;
}

/**
 * Shared limits for client document uploads (invoices, allowances, 其他文件).
 *
 * Uploaded invoices/allowances are sent to Gemini for AI extraction as inline
 * base64 inside a single generateContent request, which caps the total request
 * at ~20MB. Base64 inflates payload by ~37%, so the practical per-file ceiling
 * for extraction is ~15MB raw — anything larger uploads fine but then fails in
 * AI processing. We cap each file at 10MB to keep extraction reliable, and the
 * whole batch at 50MB so a single submission can't stall the browser/network.
 */

/** Accepted MIME types for document uploads (images and PDFs). */
export const ACCEPTED_UPLOAD_MIME_TYPES = ["image/*", "application/pdf"];

/** Maximum size of a single uploaded file, in bytes (10MB). */
export const MAX_UPLOAD_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum combined size of all files in one upload batch, in bytes (50MB). */
export const MAX_UPLOAD_BATCH_SIZE = 50 * 1024 * 1024;

/** Maximum number of files allowed in one upload batch. */
export const MAX_UPLOAD_FILES = 10;

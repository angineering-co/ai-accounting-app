---
name: Auto-classify Invoice Uploads
overview: Use Gemini 2.5 Flash to automatically classify uploaded documents as invoice/allowance and in/out, removing the need for manual user selection.
todos:
  - id: add-gemini-classification
    content: Add `classifyDocument` function to `lib/services/gemini.ts`
    status: pending
  - id: create-classification-action
    content: Create server action `classifyUploadedDocumentAction` to handle frontend requests
    status: pending
  - id: update-frontend-dialog
    content: Update `invoice-upload-dialog.tsx` to remove manual selection and use the new classification action
    status: pending
isProject: false
---

# Auto-classify Invoice Uploads

We will implement a Two-Pass Gemini approach where the system first quickly classifies the uploaded document to determine its type (invoice vs allowance) and direction (in vs out) before inserting it into the database.

## 1. Backend: Add Classification Logic

- **File**: `lib/services/gemini.ts`
- **Action**: Add a new function `classifyDocument(fileData, mimeType, clientInfo)` that calls `gemini-2.5-flash`.
- **Prompt**: Instruct Gemini to identify if the document is an Invoice ("統一發票") or Allowance ("折讓證明單"), and whether the client (based on their Tax ID) is the Buyer ("in") or Seller ("out").
- **Output**: Returns a JSON object `{ "documentType": "invoice" | "allowance", "inOrOut": "in" | "out" }`.

## 2. Server Action: Create Classification Endpoint

- **File**: `app/actions/document-classification.ts` (or similar appropriate location)
- **Action**: Create a new server action `classifyUploadedDocumentAction(storagePath, clientId, filename)` that:
  1. Fetches the client info from the database.
  2. Downloads the file from Supabase storage using `storagePath`.
  3. Calls `classifyDocument` from `gemini.ts`.
  4. Returns the classification result.

## 3. Frontend: Update Upload Dialog

- **File**: `components/invoice/invoice-upload-dialog.tsx`
- **Action**: 
  1. Remove `document_type` from `uploadFormSchema` and the UI.
  2. Update `handleUploadComplete` to first call `classifyUploadedDocumentAction` for each uploaded file in parallel.
  3. Based on the returned classification, dynamically route the file to either `createAllowance` or `createInvoice` with the correct `in_or_out` parameter.
  4. Show a unified success toast.

This approach keeps the existing database schema and extraction pipeline completely intact while significantly improving the user experience.
# Invoice Upload Feature Implementation Guide

## Summary of Design Discussion

### Overview
We are implementing an invoice upload page where users can upload scanned invoices to be processed using AI for tax purposes. The design focuses on showing the relationship between invoices and clients while maintaining a clean, intuitive user experience.

### Key Design Decisions

1. **URL Structure**:
   - Main invoice page: `/firm/[firmId]/invoice`
   - Client-specific invoices: `/firm/[firmId]/client/[clientId]` (with invoices tab/section)
   - Individual invoice detail: `/firm/[firmId]/invoice/[invoiceId]` (future enhancement)

2. **Primary View (Option A - Recommended)**:
   - Centralized invoice management page with a table showing all invoices
   - Client column displays client name (or "未指定" if unassigned)
   - Clickable client names for filtering/navigation
   - Visual indicators for invoices without client assignment

3. **Client Detail Integration (Option C - Also Implemented)**:
   - Add an "Invoices" section/tab to the client detail page
   - Show invoices specific to that client
   - Allow quick upload for that specific client

4. **Invoice Type (`in_or_out`)**:
   - User-selected field indicating:
     - `'in'` = 進項發票 (Input invoice)
     - `'out'` = 銷項發票 (Output invoice)
   - Can be set during upload or edited later

5. **Upload Component**:
   - Use Supabase's official Dropzone component from [their documentation](https://supabase.com/ui/docs/nextjs/dropzone)
   - Supports drag-and-drop, multiple files, file validation, and progress indicators

### Database Schema

The `invoices` table needs to be created with the following structure:

```sql
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    storage_path TEXT NOT NULL,
    filename TEXT NOT NULL,
    in_or_out TEXT CHECK (in_or_out IN ('in', 'out')) NOT NULL,
    status TEXT CHECK (status IN ('uploaded', 'processing', 'processed', 'confirmed', 'failed')) DEFAULT 'uploaded',
    extracted_data JSONB, -- Stores AI-extracted fields (amount, date, tax_id, etc.)
    uploaded_by UUID REFERENCES profiles(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**Status Flow**:
- `uploaded` (default): File uploaded, waiting for AI processing. User can edit metadata.
- `processing`: AI extraction in progress (may be queued for batch processing).
- `processed`: AI extraction complete, extracted data available for user review.
- `confirmed`: User has reviewed and confirmed the extracted data. Ready for report generation.
- `failed`: Error state (upload failed, AI extraction failed, etc.). Can be retried or deleted.

**Note**: Users can edit invoices even after `confirmed` status. The `extracted_data` JSONB column stores all AI-extracted fields (e.g., invoice number, date, amount, tax amount, vendor info, etc.) which can be reviewed and confirmed by the user.

**RLS Policies**:
- All operations: `firm_id` matches authenticated user's `firm_id` OR user is `super_admin`

**Storage Bucket**:
- Create a Supabase Storage bucket named `invoices` (or similar)
- Configure RLS policies for the bucket to match table-level RLS

---

## Implementation Steps

### Step 1: Database Migration

1. **Create migration file**: `supabase/migrations/[timestamp]_create_invoices_table.sql`

   ```sql
   -- Create invoices table
   CREATE TABLE invoices (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       firm_id UUID REFERENCES firms(id) ON DELETE CASCADE NOT NULL,
       client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
       storage_path TEXT NOT NULL,
       filename TEXT NOT NULL,
       in_or_out TEXT CHECK (in_or_out IN ('in', 'out')) NOT NULL,
       status TEXT CHECK (status IN ('uploaded', 'processing', 'processed', 'confirmed', 'failed')) DEFAULT 'uploaded',
       extracted_data JSONB, -- Stores AI-extracted fields (amount, date, tax_id, vendor info, etc.)
       uploaded_by UUID REFERENCES profiles(id) NOT NULL,
       created_at TIMESTAMPTZ DEFAULT now()
   );

   -- Enable RLS
   ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

   -- RLS Policy: Users can manage invoices in their firm
   CREATE POLICY "Users can manage invoices in their firm" ON invoices
       FOR ALL
       USING (
           firm_id = public.get_auth_user_firm_id()
           OR (auth.jwt() ->> 'role' = 'super_admin')
       );

   -- Create index for common queries
   CREATE INDEX idx_invoices_firm_id ON invoices(firm_id);
   CREATE INDEX idx_invoices_client_id ON invoices(client_id);
   CREATE INDEX idx_invoices_status ON invoices(status);
   CREATE INDEX idx_invoices_created_at ON invoices(created_at DESC);
   
   -- Index for querying extracted_data JSONB (if needed for filtering/searching)
   -- Example: CREATE INDEX idx_invoices_extracted_data ON invoices USING GIN (extracted_data);
   ```

2. **Run migration**: `supabase migration up` (or apply via Supabase dashboard)

3. **Regenerate types**: `supabase gen types typescript --local > supabase/database.types.ts`

### Step 2: Create Storage Bucket

1. **Via Supabase Dashboard**:
   - Go to Storage → Create bucket
   - Name: `invoices`
   - Public: `false` (private bucket)
   - File size limit: Configure as needed (default 50MB)

2. **Storage RLS Policies** (via SQL or Dashboard):
   ```sql
   -- Policy: Users can upload to their firm's folder
   CREATE POLICY "Users can upload invoices for their firm"
   ON storage.objects FOR INSERT
   WITH CHECK (
       bucket_id = 'invoices' AND
       (storage.foldername(name))[1] = (SELECT firm_id::text FROM profiles WHERE id = auth.uid())
   );

   -- Policy: Users can read invoices from their firm
   CREATE POLICY "Users can read invoices from their firm"
   ON storage.objects FOR SELECT
   USING (
       bucket_id = 'invoices' AND
       (storage.foldername(name))[1] = (SELECT firm_id::text FROM profiles WHERE id = auth.uid())
   );
   ```

### Step 3: Install Supabase Dropzone Component

Use the shadcn CLI to add the Supabase dropzone component:

```bash
npx shadcn@latest add @supabase/dropzone-nextjs
```

This will automatically:
- Install the component and its dependencies (including `react-dropzone`)
- Create the necessary hook (`hooks/use-supabase-upload.ts`)
- Create the dropzone component (`components/dropzone.tsx`)
- Set up all required files

### Step 4: Create Domain Models & Validation Schemas

**File**: `lib/domain/models.ts`

Add invoice schemas:

```typescript
// Schema for extracted invoice data (stored in JSONB column)
export const extractedInvoiceDataSchema = z.object({
  invoice_number: z.string().optional(),
  invoice_date: z.string().optional(), // ISO date string
  amount: z.number().optional(),
  tax_amount: z.number().optional(),
  total_amount: z.number().optional(),
  vendor_name: z.string().optional(),
  vendor_tax_id: z.string().optional(),
  // Add other extracted fields as needed
}).passthrough(); // Allow additional fields from AI extraction

export const invoiceSchema = z.object({
  id: z.string().uuid(),
  firm_id: z.string().uuid(),
  client_id: z.string().uuid().nullable().optional(),
  storage_path: z.string().min(1),
  filename: z.string().min(1),
  in_or_out: z.enum(['in', 'out']),
  status: z.enum(['uploaded', 'processing', 'processed', 'confirmed', 'failed']),
  extracted_data: extractedInvoiceDataSchema.nullable().optional(),
  uploaded_by: z.string().uuid(),
  created_at: z.string().datetime(),
});

export const createInvoiceSchema = z.object({
  firm_id: z.string().uuid(),
  client_id: z.string().uuid().nullable().optional(),
  storage_path: z.string().min(1),
  filename: z.string().min(1),
  in_or_out: z.enum(['in', 'out']),
});

export const updateInvoiceSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  in_or_out: z.enum(['in', 'out']).optional(),
  status: z.enum(['uploaded', 'processing', 'processed', 'confirmed', 'failed']).optional(),
  extracted_data: extractedInvoiceDataSchema.nullable().optional(),
});

export type Invoice = z.infer<typeof invoiceSchema>;
export type ExtractedInvoiceData = z.infer<typeof extractedInvoiceDataSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
```

### Step 5: Create Invoice Service Layer

**File**: `lib/services/invoice.ts`

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { createInvoiceSchema, updateInvoiceSchema, type CreateInvoiceInput, type UpdateInvoiceInput } from '@/lib/domain/models';

export async function createInvoice(data: CreateInvoiceInput) {
  const supabase = await createClient();
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Validate input
  const validated = createInvoiceSchema.parse(data);

  // Insert invoice record
  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      ...validated,
      uploaded_by: user.id,
      status: 'uploaded',
    })
    .select()
    .single();

  if (error) throw error;
  return invoice;
}

export async function updateInvoice(invoiceId: string, data: UpdateInvoiceInput) {
  const supabase = await createClient();
  
  const validated = updateInvoiceSchema.parse(data);

  const { data: invoice, error } = await supabase
    .from('invoices')
    .update(validated)
    .eq('id', invoiceId)
    .select()
    .single();

  if (error) throw error;
  return invoice;
}

export async function deleteInvoice(invoiceId: string) {
  const supabase = await createClient();
  
  // First, get the invoice to retrieve storage_path
  const { data: invoice, error: fetchError } = await supabase
    .from('invoices')
    .select('storage_path')
    .eq('id', invoiceId)
    .single();

  if (fetchError) throw fetchError;
  if (!invoice) throw new Error('Invoice not found');

  // Delete the file from storage
  if (invoice.storage_path) {
    const { error: storageError } = await supabase.storage
      .from('invoices')
      .remove([invoice.storage_path]);
    
    if (storageError) throw storageError;
  }

  // Delete the database record
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoiceId);

  if (error) throw error;
}
```

### Step 6: Configure Dropzone for Invoice Uploads

The dropzone component and hook are already created by shadcn. Now adapt them for invoice uploads:

**File**: `hooks/use-supabase-upload.ts` (or wherever shadcn placed it)

Configure the hook to:
- Use the `invoices` bucket
- Support file path structure: `{firmId}/{uuid}/{original_filename}` (using UUID to ensure uniqueness before invoice record creation)
- Handle file size limits appropriate for scanned invoices (e.g., 10-50MB)
- Accept appropriate MIME types: `['image/*', 'application/pdf']`

**File**: `components/dropzone.tsx` (or wherever shadcn placed it)

The component is ready to use. You may want to customize:
- Styling to match your app's design system
- Empty state messages (translate to zh-TW)
- Success/error messages (translate to zh-TW)

### Step 7: Create Invoice Form Fields Component

**File**: `components/invoice-form-fields.tsx`

Similar to `client-form-fields.tsx`, create form fields for:
- Client selection (dropdown with search)
- Invoice type (`in_or_out`) - Radio buttons or Select
- File upload (integrated with Dropzone component from Step 6)

### Step 8: Create Main Invoice Page

**File**: `app/firm/[firmId]/invoice/page.tsx`

Structure:
1. **Header Section**:
   - Title: "發票管理"
   - Description: "上傳和管理您的發票資料"
   - Upload button/zone

2. **Upload Zone** (using Dropzone):
   - Drag-and-drop area
   - File selection
   - Client selection (optional)
   - Invoice type selection (in/out)
   - Upload button

3. **Invoice Table**:
   - Columns: 檔案名稱, 客戶, 類型, 狀態, 上傳時間, 操作
   - Status badges:
     - `uploaded` - 已上傳 (default, blue/gray)
     - `processing` - 處理中 (yellow, with spinner)
     - `processed` - 待確認 (orange, indicates action needed)
     - `confirmed` - 已確認 (green)
     - `failed` - 失敗 (red)
   - Filters: Client dropdown, Status tabs, Type filter
   - Actions: 
     - Review/Confirm (for `processed` status) - Opens review modal with extracted_data
     - Edit (assign client/change type/update extracted_data) - Available for all statuses
     - Delete
     - View (future: detail page with full extracted data)

4. **Features**:
   - Use SWR for data fetching
   - Real-time status updates
   - Toast notifications for success/error
   - Loading states

### Step 10: Create Invoice Review/Confirmation Component

**File**: `components/invoice-review-dialog.tsx` (or similar)

Create a dialog/modal component for reviewing and confirming extracted invoice data:

- Display extracted_data fields in an editable form
- Show original invoice image/file preview
- Allow user to edit any extracted field
- "Confirm" button sets status to `confirmed` and saves any edits
- "Save Changes" button updates extracted_data without changing status (for `processed` invoices)
- Use react-hook-form with zod validation for extracted_data

**Status Transitions**:
- `processed` → `confirmed`: User reviews and confirms the data
- `confirmed` → `processed`: User edits confirmed invoice (optional, if you want to allow "unconfirming")
- All statuses → editable: Users can always edit metadata (client_id, in_or_out) and extracted_data

### Step 11: Integrate Dropzone in Invoice Page

In the main invoice page (`app/firm/[firmId]/invoice/page.tsx`), integrate the dropzone component:

```typescript
import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/components/dropzone';
import { useSupabaseUpload } from '@/hooks/use-supabase-upload';

// In your component:
const uploadProps = useSupabaseUpload({
  bucketName: 'invoices',
  path: `${firmId}/${crypto.randomUUID()}`, // Files will be stored in invoices/{firmId}/{uuid}/{filename}
  allowedMimeTypes: ['image/*', 'application/pdf'],
  maxFiles: 10, // Allow multiple files
  maxFileSize: 50 * 1024 * 1024, // 50MB
});
```

### Step 12: Add Invoices Section to Client Detail Page

**File**: `app/firm/[firmId]/client/[clientId]/page.tsx` (or modify existing client page)

Add:
- Tabs or sections: "基本資料", "發票"
- Invoices tab shows:
  - List of invoices for this client
  - Quick upload button (pre-filled with client_id)
  - Invoice statistics (count, by type, by status)

### Step 13: Update Sidebar Navigation

The sidebar already has the invoice link (`/firm/${firmId}/invoice`), so no changes needed unless you want to add a badge showing pending invoice count.

---

## File Structure Summary

```
app/firm/[firmId]/
  ├── invoice/
  │   ├── page.tsx                    # Main invoice list + upload page
  │   └── [invoiceId]/
  │       └── page.tsx                 # Future: Invoice detail/edit page
  └── client/
      └── [clientId]/
          └── page.tsx                 # Add invoices tab/section here

components/
  ├── dropzone.tsx                     # Supabase dropzone component (created by shadcn)
  ├── invoice-form-fields.tsx          # Form fields for invoice metadata
  ├── invoice-table.tsx                # Invoice list table component
  ├── invoice-review-dialog.tsx       # Review/confirm extracted data dialog
  └── invoice-upload-zone.tsx         # Upload zone with client/type selection (optional wrapper)

hooks/
  └── use-supabase-upload.ts           # Upload hook for Supabase Storage (created by shadcn)

lib/
  ├── domain/
  │   └── models.ts                     # Add invoice schemas
  └── services/
      └── invoice.ts                   # Server actions for invoice CRUD

supabase/
  └── migrations/
      └── [timestamp]_create_invoices_table.sql
```

---

## Testing Checklist

- [ ] Database migration runs successfully (including extracted_data JSONB column)
- [ ] Storage bucket created and accessible
- [ ] RLS policies work correctly (users can only access their firm's invoices)
- [ ] File upload works (single and multiple files)
- [ ] Invoice records created in database with `uploaded` status
- [ ] Status transitions work correctly:
  - [ ] `uploaded` → `processing` (when AI job starts)
  - [ ] `processing` → `processed` (when AI completes)
  - [ ] `processing` → `failed` (on AI error)
  - [ ] `processed` → `confirmed` (when user confirms)
  - [ ] All statuses allow editing metadata
- [ ] Client assignment works (during upload and after)
- [ ] Invoice type selection works
- [ ] Extracted data (extracted_data JSONB) can be stored and retrieved
- [ ] Invoice review dialog displays extracted_data correctly
- [ ] User can edit extracted_data in review dialog
- [ ] Confirmation updates status to `confirmed`
- [ ] Invoice table displays correctly with status badges
- [ ] Filters work (by client, status, type)
- [ ] Client detail page shows invoices for that client
- [ ] Delete invoice works (removes both DB record and storage file)
- [ ] Status updates reflect in real-time (SWR polling or realtime subscription)
- [ ] Error handling works (invalid files, network errors, etc.)

---

## Future Enhancements

1. **Invoice Detail Page**: View extracted data, edit metadata, reprocess
2. **Bulk Operations**: Assign multiple invoices to a client, bulk delete
3. **AI Processing**: Webhook/edge function to trigger AI extraction after upload
4. **File Preview**: Show thumbnail/preview of uploaded invoices
5. **Search**: Full-text search by filename, client name, extracted data
6. **Export**: Export invoice data for tax reporting
7. **Analytics**: Dashboard showing invoice statistics by client, type, status

---

## Notes

- All UI text should be in Traditional Chinese (zh-TW)
- Follow existing patterns from the client page for consistency
- Use shadcn components (Table, Dialog, Button, Badge, etc.)
- Use react-hook-form + zod for form validation
- Use SWR for data fetching with caching
- Use sonner for toast notifications
- Use ResponsiveDialog for modals on mobile


# Technical Design Document: AI Accounting Firm

## 1. Architecture Overview
- **Frontend/App Server**: Next.js (App Router) + TypeScript.
- **Database/Auth/Storage**: Supabase.
- **Data Access**: `supabase-js` wrapped in a **Storage Layer** (`storage/`) to decouple UI from DB.
- **Multi-tenancy**: Path-based routing (`/[firmId]/...`) with RLS.
- **AI/Job Processing**: Supabase Database Webhooks -> Edge Functions -> Genkit (Gemini).

## 2. Database Schema Design (PostgreSQL / Supabase)

This schema is designed for multi-tenancy using Row Level Security (RLS) as the primary isolation mechanism. All tables (except `firms`) include a `firm_id` to enforce tenant boundaries.

### 2.1 Tables

#### `firms`
Represents the tenant (Accounting Firm).
*   **id**: `UUID` (Primary Key, Default: `gen_random_uuid()`)
*   **name**: `TEXT` (Not Null)
*   **tax_id**: `TEXT` (Not Null) - (統一編號)
*   **created_at**: `TIMESTAMPTZ` (Default: `now()`)
*   **RLS Policy**:
    *   `SELECT`: Authenticated users can read their own firm OR `auth.jwt() ->> 'role' = 'super_admin'`.
    *   `INSERT`: System admin or initial signup flow only.

#### `profiles`
Public profile table linked 1:1 with Supabase Auth (`auth.users`).
*   **id**: `UUID` (Primary Key, Foreign Key -> `auth.users.id` with `ON DELETE CASCADE`)
*   **firm_id**: `UUID` (Foreign Key -> `firms.id`, Nullable for super admins)
*   **name**: `TEXT`
*   **role**: `TEXT` (Check: `IN ('admin', 'staff', 'super_admin')`, Default: `admin`)
*   **created_at**: `TIMESTAMPTZ` (Default: `now()`)
*   **RLS Policy**:
    *   `SELECT`: Users can read profiles `WHERE firm_id = auth.uid().firm_id` OR `auth.jwt() ->> 'role' = 'super_admin'`.
    *   `UPDATE`: Users can update their own profile.

#### `clients`
The customers of the accounting firm.
*   **id**: `UUID` (Primary Key, Default: `gen_random_uuid()`)
*   **firm_id**: `UUID` (Foreign Key -> `firms.id` with `ON DELETE CASCADE`)
*   **name**: `TEXT` (Not Null)
*   **contact_person**: `TEXT` (負責人姓名)
*   **tax_id**: `TEXT` (Not Null) - (統一編號)
*   **tax_payer_id**: `TEXT` (Not Null) - (稅籍編號)
*   **industry**: `TEXT` (產業描述)
*   **created_at**: `TIMESTAMPTZ` (Default: `now()`)
*   **RLS Policy**:
    *   `ALL`: `firm_id` matches the authenticated user's `firm_id` OR `auth.jwt() ->> 'role' = 'super_admin'`.

#### `invoices`
Represents the uploaded documents (Receipts/Invoices) to be processed.
*   **id**: `UUID` (Primary Key, Default: `gen_random_uuid()`)
*   **firm_id**: `UUID` (Foreign Key -> `firms.id`)
*   **client_id**: `UUID` (Foreign Key -> `clients.id`, Nullable)
*   **storage_path**: `TEXT` (Not Null)
*   **filename**: `TEXT` (Not Null)
*   **in_or_out**: (Check: `IN ('in', 'out')`)
*   **status**: `TEXT` (Check: `IN ('pending', 'processing', 'completed', 'failed')`, Default: `pending`)
*   **uploaded_by**: `UUID` (Foreign Key -> `profiles.id`)
*   **created_at**: `TIMESTAMPTZ` (Default: `now()`)
*   **RLS Policy**:
    *   `ALL`: `firm_id` matches the authenticated user's `firm_id` OR `auth.jwt() ->> 'role' = 'super_admin'`.

### 2.2 User Roles & Permissions

*   **`super_admin`**: Global system administrator (Internal). 
    *   Has full access to all firms, clients, and invoices across the entire platform.
    *   `firm_id` is typically `NULL`.
*   **`admin`**: Firm Manager (Tenant Owner). 
    *   Full access to all data within their specific `firm_id`.
    *   Can manage `staff` profiles within the same firm.
*   **`staff`**: Firm Employee.
    *   Standard access to view, upload, and process data for their `firm_id`.
*   **`client`** (Future): The actual customer of the accounting firm.
    *   Restricted access to view only their own invoices and reports.
    *   Will require a `client_id` link in the `profiles` table.

---

## 3. Data Models & Storage Layer Design

We will use the **Repository/DAO Pattern** to abstract the database client. This allows us to swap the underlying implementation (Supabase -> Prisma -> Drizzle) without affecting the UI components.

### 3.1 Directory Structure
```
domain/         # Pure TypeScript Interfaces (The Contract)
  models.ts     # Profile, Firm, Client, Invoice interfaces
storage/        # The Implementation Layer
  types.ts      # Storage interface definitions
  supabase/     # Supabase-specific implementation
    firm.ts
    profile.ts
    invoice.ts
  index.ts      # Exports the specific implementation to the app
lib/
  supabase/     # Supabase client setup (Browser/Server)
    client.ts
    server.ts
```

### 3.2 Domain Models (`domain/models.ts`)
These interfaces define the shape of data used by the UI. They do **not** depend on Supabase types.

```typescript
export interface Profile {
  id: string;
  firmId?: string;
  name: string;
  role: 'admin' | 'staff' | 'super_admin';
}

export interface Firm {
  id: string;
  businessName: string; // 營業人名稱
  taxId: string; // 統一編號
}

export interface Client {
  id: string;
  firmId: string;
  businessName: string; // 營業人名稱
  taxId: string; // 統一編號
  taxPayerId: string; // 稅籍編號
  industry?: string; // 產業描述
}

export interface Invoice {
  id: string;
  firmId: string;
  clientId?: string;
  filename: string;
  storagePath: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  uploadedBy: string;
  createdAt: Date;
}
```

### 3.3 Storage Layer Interface (`storage/types.ts`)
This defines *how* the application talks to the data layer.

```typescript
import { Client, Invoice, Profile } from '@/domain/models';

export interface InvoiceStorage {
  upload(file: File, firmId: string, userId: string): Promise<Invoice>;
  list(firmId: string): Promise<Invoice[]>;
  get(id: string): Promise<Invoice | null>;
  updateStatus(id: string, status: Invoice['status']): Promise<void>;
}

export interface ClientStorage {
  create(firmId: string, data: Partial<Client>): Promise<Client>;
  list(firmId: string): Promise<Client[]>;
}

export interface ProfileStorage {
  getProfile(userId: string): Promise<Profile | null>;
}
```

### 3.4 Supabase Implementation (`storage/supabase/invoice.ts`)
The concrete implementation using `supabase-js`. It uses the clients from `lib/supabase/`.

```typescript
import { InvoiceStorage } from '../types';
import { createClient } from '@/lib/supabase/server';
import { Invoice } from '@/domain/models';

export const supabaseInvoiceStorage: InvoiceStorage = {
  async list(firmId: string): Promise<Invoice[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('firm_id', firmId);
      
    if (error) throw error;
    
    // Mapper: DB Snake_case -> Domain CamelCase
    return data.map(row => ({
      id: row.id,
      firmId: row.firm_id,
      clientId: row.client_id,
      filename: row.filename,
      storagePath: row.storage_path,
      status: row.status,
      uploadedBy: row.uploaded_by,
      createdAt: new Date(row.created_at)
    }));
  },
  
  // ... implement upload, get, updateStatus similarly
};
```


### 3.5 Usage in UI Components
The UI never imports `supabase-js` directly for data fetching.

```tsx
import { invoiceStorage } from '@/storage';

export default async function InvoiceList({ params }: { params: { firmId: string } }) {
  // If we switch to Prisma later, we only change the import in @/storage/index.ts
  const invoices = await invoiceStorage.list(params.firmId);
  
  return (
    <ul>
      {invoices.map(inv => <li key={inv.id}>{inv.filename}</li>)}
    </ul>
  );
}
```

## 4. Authentication & Onboarding Flow

Given the focus on Firm Signup/Signin (no client login yet):

### 4.1 Firm Signup (Onboarding)
1.  **User Registration**: User signs up via Supabase Auth (Email/Password or OAuth).
2.  **Profile Creation**:
    *   Trigger: `INSERT ON auth.users` (Supabase Trigger) OR Manual Step after signup.
    *   Action: Create row in `profiles` table.
3.  **Firm Creation**:
    *   UI: "Create your Firm" form.
    *   Action: Insert into `firms`.
    *   Link: Update the current `profiles` row with the new `firm_id` and set role to `admin`.

### 4.2 Firm Signin
1.  **Login**: User authenticates.
2.  **Routing**:
    *   Fetch `firm_id` from `profiles` table.
    *   If `firm_id` exists: Redirect to `/[firmId]/dashboard`.
    *   If `firm_id` is null: Redirect to `/onboarding` (Create Firm).

```
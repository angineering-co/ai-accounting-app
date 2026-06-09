// Shared firm-scope / staff-role authorization helpers for the service layer.
//
// NOT a Server Action module (intentionally no 'use server'). Like
// lib/services/journal-entry.ts, the exports here accept an injected userId /
// supabase client; marking this 'use server' would expose them as public
// endpoints where a caller could pass an arbitrary userId and skip the
// firm-scope authorization. Callers reach them through their own 'use server'
// wrappers.
//
// Mechanism note: these run through an RLS-bounded supabase client. RLS already
// firm-scopes the underlying tables, so the existence reads here ARE the
// firm-scope boundary for any downstream Drizzle query (Drizzle bypasses RLS).
// The staff gate additionally does an EXPLICIT firm_id compare so it holds even
// under a service-role client (which bypasses RLS) — e.g. the one tests inject.
//
// This is distinct from lib/db/rls.ts, whose assertCallerCanAccess* helpers take
// a Drizzle tx and check firm-scope via Drizzle directly. Different mechanism,
// different home — they are not interchangeable.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/supabase/database.types";

// Firm staff = everyone who is not a portal 'client'. Ledger-finalizing
// mutations (posting, draft-entry generation) are restricted to these roles.
export const STAFF_ROLES = ["admin", "staff", "super_admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(
  role: string | null | undefined,
): role is StaffRole {
  return role != null && (STAFF_ROLES as readonly string[]).includes(role);
}

type CallerProfile = { role: string | null; firm_id: string | null };

// Single home for the caller profile read. Explicit read (holds under the
// service-role test client, which bypasses RLS). A genuine DB error throws; a
// missing row resolves to null.
async function loadCallerProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CallerProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, firm_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Role gate only — no client/firm scope. Throws "權限不足" if the caller is not
// firm staff. Returns the profile (role + firm_id) for reuse. Use where the
// firm boundary is enforced by a separate RLS-bounded read (e.g. a period read).
export async function assertStaffRole(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CallerProfile> {
  const profile = await loadCallerProfile(supabase, userId);
  if (!profile || !isStaffRole(profile.role)) {
    throw new Error("權限不足");
  }
  return profile;
}

// Firm-staff + firm-scope client gate. super_admin is firm-exempt; other staff
// require their firm to own the client. Uses an EXPLICIT firm_id compare (not
// RLS) so it holds under a service-role client. A non-staff caller throws
// "權限不足"; a missing / cross-firm client collapses to one "not accessible"
// message (a firm boundary, not a role problem). Both firm_ids must be non-null
// before they can match, so an unassociated staff member and an unassociated
// client never pass (matches lib/db/rls.ts::assertCallerCanAccessClient).
export async function assertStaffCanAccessClient(
  supabase: SupabaseClient<Database>,
  userId: string,
  clientId: string,
): Promise<void> {
  const profile = await loadCallerProfile(supabase, userId);
  if (!profile || !isStaffRole(profile.role)) {
    throw new Error("權限不足");
  }
  const { data: client, error } = await supabase
    .from("clients")
    .select("firm_id")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!client) {
    throw new Error(`client ${clientId} not found or not accessible`);
  }
  if (
    profile.role !== "super_admin" &&
    (!profile.firm_id || !client.firm_id || client.firm_id !== profile.firm_id)
  ) {
    throw new Error(`client ${clientId} not found or not accessible`);
  }
}

// RLS-bounded existence read of a client row — NO role gate (a portal
// client-role user may read their own client). The firm-scope boundary for the
// GL read path, where downstream Drizzle queries bypass RLS. Throws if the row
// is not found / not accessible.
export async function assertClientReadable(
  supabase: SupabaseClient<Database>,
  clientId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(`client ${clientId} not found or not accessible`);
  }
}

// RLS-bounded existence read of a tax_filing_periods row — NO role gate. The
// firm-scope boundary for the period-batch helpers, where downstream Drizzle
// queries bypass RLS. Throws if the row is not found / not accessible.
export async function assertPeriodReadable(
  supabase: SupabaseClient<Database>,
  periodId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("tax_filing_periods")
    .select("id")
    .eq("id", periodId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(`period ${periodId} not found or not accessible`);
  }
}

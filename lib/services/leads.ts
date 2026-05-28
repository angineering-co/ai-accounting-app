"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface LeadRecord {
  id: string;
  lead_code: string;
  path: string;
  status: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * List leads from /apply form submissions, newest first.
 *
 * Gated to firm admins and super_admins — leads are SnapBooks-wide, not
 * firm-scoped, so staff and clients should not see them. Uses the admin
 * client to bypass RLS (the `leads` table has no SELECT policy).
 */
export async function listLeads(limit = 200): Promise<LeadRecord[]> {
  const authed = await createClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) return [];

  const { data: profile } = await authed
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role ?? "")) {
    return [];
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leads")
    .select("id, lead_code, path, status, data, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listLeads failed:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    ...row,
    data: (row.data ?? {}) as Record<string, unknown>,
  }));
}

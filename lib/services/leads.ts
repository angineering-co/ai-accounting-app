"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLeadStatus } from "@/lib/domain/lead-status";

export interface LeadRecord {
  id: string;
  lead_code: string;
  path: string;
  status: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  /**
   * Whether this lead has joined our LINE channel — true when a `line_accounts`
   * row is linked to this lead (the person followed our OA and sent their lead
   * code). Lets admins spot leads to follow up with by phone.
   */
  has_line: boolean;
}

/**
 * Returns true when the signed-in user is a firm admin or super_admin. Leads
 * are SnapBooks-wide (not firm-scoped), so staff and clients must not see or
 * mutate them.
 */
async function isLeadsAdmin(): Promise<boolean> {
  const authed = await createClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) return false;

  const { data: profile } = await authed
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return !!profile && ["admin", "super_admin"].includes(profile.role ?? "");
}

/**
 * List leads from /apply form submissions, newest first.
 *
 * Gated to firm admins and super_admins. Uses the admin client to bypass RLS
 * (the `leads` table has no SELECT policy).
 */
export async function listLeads(limit = 15): Promise<LeadRecord[]> {
  try {
    if (!(await isLeadsAdmin())) return [];

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

    const leadIds = (data ?? []).map((row) => row.id);
    const linkedLeadIds = new Set<string>();
    if (leadIds.length > 0) {
      const { data: lineRows, error: lineError } = await admin
        .from("line_accounts")
        .select("lead_id")
        .in("lead_id", leadIds);
      if (lineError) {
        console.error("listLeads line_accounts lookup failed:", lineError);
      } else {
        for (const row of lineRows ?? []) {
          if (row.lead_id) linkedLeadIds.add(row.lead_id);
        }
      }
    }

    return (data ?? []).map((row) => ({
      ...row,
      data: (row.data ?? {}) as Record<string, unknown>,
      has_line: linkedLeadIds.has(row.id),
    }));
  } catch (err) {
    console.error("listLeads unexpected error:", err);
    return [];
  }
}

/**
 * Update a lead's pipeline status. Admin-gated; validates the status against
 * the allowed set before writing (the DB `leads_status_check` constraint is
 * the backstop). Returns an `ok`/`error` result for the caller to surface.
 */
export async function updateLeadStatus(
  leadId: string,
  status: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(await isLeadsAdmin())) {
      return { ok: false, error: "沒有權限變更申請狀態。" };
    }

    if (!isLeadStatus(status)) {
      return { ok: false, error: "無效的狀態值。" };
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("leads")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", leadId);

    if (error) {
      console.error("updateLeadStatus failed:", error);
      return { ok: false, error: "更新失敗，請稍後再試。" };
    }

    return { ok: true };
  } catch (err) {
    console.error("updateLeadStatus unexpected error:", err);
    return { ok: false, error: "更新失敗，請稍後再試。" };
  }
}

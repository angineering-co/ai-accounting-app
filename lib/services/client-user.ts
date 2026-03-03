"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteClientUserSchema } from "@/lib/domain/models";

type ClientUserSummary = {
  id: string;
  name: string | null;
  email: string | null;
  created_at: string | null;
};

async function requireFirmManager() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, firm_id, role")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    throw new Error("Profile not found");
  }

  const allowedRoles = new Set(["admin", "staff", "super_admin"]);
  if (!allowedRoles.has(profile.role ?? "")) {
    throw new Error("Insufficient permissions");
  }

  return { supabase, user, profile };
}

function getInviteRedirectTo(origin: string) {
  return `${origin}/auth/confirm?next=/auth/update-password`;
}

function getAppOrigin(headerOrigin: string | null) {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  const preferred = fromEnv ?? headerOrigin ?? "http://127.0.0.1:3000";

  if (preferred.startsWith("http://localhost:")) {
    return preferred.replace("http://localhost:", "http://127.0.0.1:");
  }

  if (preferred.startsWith("https://localhost:")) {
    return preferred.replace("https://localhost:", "https://127.0.0.1:");
  }

  return preferred;
}

export async function inviteClientUser(clientId: string, email: string, name?: string) {
  const validated = inviteClientUserSchema.parse({ clientId, email, name });
  const { supabase, profile } = await requireFirmManager();

  const { data: clientRecord, error: clientError } = await supabase
    .from("clients")
    .select("id, firm_id, name, contact_person")
    .eq("id", validated.clientId)
    .single();

  if (clientError || !clientRecord) {
    throw new Error("Client not found");
  }

  if (profile.role !== "super_admin" && clientRecord.firm_id !== profile.firm_id) {
    throw new Error("Cannot invite users for another firm");
  }

  const { data: existingProfiles, error: existingProfileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("client_id", validated.clientId)
    .limit(1);

  if (existingProfileError) {
    throw existingProfileError;
  }

  if (existingProfiles.length > 0) {
    throw new Error("This client already has a portal user");
  }

  const headerStore = await headers();
  const origin = getAppOrigin(headerStore.get("origin"));

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(validated.email, {
    data: {
      name: validated.name || clientRecord.contact_person || clientRecord.name,
      role: "client",
      firm_id: clientRecord.firm_id,
      client_id: clientRecord.id,
    },
    redirectTo: getInviteRedirectTo(origin),
  });

  if (error) {
    throw error;
  }

  return data.user;
}

export async function revokeClientUserAccess(userId: string) {
  await requireFirmManager();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    throw error;
  }
}

export async function getClientUsers(clientId: string): Promise<ClientUserSummary[]> {
  const { supabase, profile } = await requireFirmManager();
  const { data: clientRecord, error: clientError } = await supabase
    .from("clients")
    .select("id, firm_id")
    .eq("id", clientId)
    .single();

  if (clientError || !clientRecord) {
    throw new Error("Client not found");
  }

  if (profile.role !== "super_admin" && clientRecord.firm_id !== profile.firm_id) {
    throw new Error("Cannot access users from another firm");
  }

  const { data: clientProfiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, name, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (profileError) {
    throw profileError;
  }

  if (clientProfiles.length === 0) {
    return [];
  }

  const admin = createAdminClient();

  const usersWithEmails = await Promise.all(
    clientProfiles.map(async (profileRow) => {
      const { data: authUser, error } = await admin.auth.admin.getUserById(
        profileRow.id,
      );
      if (error) {
        console.error(
          `Failed to fetch auth user for profile ${profileRow.id}:`,
          error,
        );
      }
      return {
        id: profileRow.id,
        name: profileRow.name,
        created_at: profileRow.created_at,
        email: authUser?.user?.email ?? null,
      };
    }),
  );

  return usersWithEmails;
}

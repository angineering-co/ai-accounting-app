import { eq } from "drizzle-orm";
import type { Tx } from "./drizzle";
import { profiles, clients } from "./schema";

export async function assertCallerCanAccessFirm(
  tx: Tx,
  userId: string,
  firmId: string,
): Promise<void> {
  const [profile] = await tx
    .select({ role: profiles.role, firm_id: profiles.firm_id })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  if (!profile) throw new Error("Caller profile not found");
  if (profile.role === "super_admin") return;
  // Firm-level guard must reject client-role callers outright. Their firm_id
  // points at the firm that owns them, but clients are scoped to a single
  // client_id and have no business invoking firm-wide operations. Use
  // assertCallerCanAccessClient for any operation a client user can perform.
  if (profile.role === "client") {
    throw new Error("Client user cannot access firm-level operation");
  }
  // Reject unlinked profiles (firm_id null). Also defends against a caller
  // passing nullish firmId at runtime — `null !== null` is false, which would
  // bypass the strict-inequality gate.
  if (!profile.firm_id || profile.firm_id !== firmId) {
    throw new Error("Caller cannot access this firm");
  }
}

export async function assertCallerCanAccessClient(
  tx: Tx,
  userId: string,
  clientId: string,
): Promise<void> {
  const [profile] = await tx
    .select({
      role: profiles.role,
      firm_id: profiles.firm_id,
      client_id: profiles.client_id,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  if (!profile) throw new Error("Caller profile not found");
  if (profile.role === "super_admin") return;

  // Client-role callers: a self-link comparison is enough, no DB lookup needed.
  // Done first so a nullish clientId doesn't get masked by "Client not found".
  if (profile.role === "client") {
    if (!profile.client_id || profile.client_id !== clientId) {
      throw new Error("Client user cannot access this client");
    }
    return;
  }

  // Firm-staff: look up the client and require both sides to share a firm.
  const [client] = await tx
    .select({ firm_id: clients.firm_id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client) throw new Error("Client not found");

  if (
    !profile.firm_id ||
    !client.firm_id ||
    profile.firm_id !== client.firm_id
  ) {
    throw new Error("Caller cannot access this client");
  }
}

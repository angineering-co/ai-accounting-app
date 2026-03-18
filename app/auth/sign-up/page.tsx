import { redirect } from "next/navigation";

// Self-service sign-up is disabled — the app is invite-only.
// New users are onboarded via inviteUserByEmail() in lib/services/client-user.ts,
// which bypasses this page entirely (/auth/confirm → /auth/update-password).
export default function Page() {
  redirect("/auth/login");
}

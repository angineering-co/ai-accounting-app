import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

/**
 * The actual dynamic logic is moved here.
 * This component will suspend when accessing cookies via getClaims().
 */
async function Redirector() {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("firm_id")
    .eq("id", claimsData.claims.sub)
    .single();

  const firmId = profile?.firm_id;

  if (firmId) {
    redirect(`/${firmId}/dashboard`);
  }

  // Fallback if no firm is found
  redirect("/");
  return <></>;
}

/**
 * The Page component handles the dynamic Redirector inside a Suspense boundary.
 * This is the required pattern for Next.js 16 Dynamic I/O.
 */
export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center italic text-muted-foreground animate-pulse">
          Redirecting to your dashboard...
        </div>
      }
    >
      <Redirector />
    </Suspense>
  );
}

import { FirmSidebar } from "@/components/firm-sidebar";
import { PortalSidebar } from "@/components/portal-sidebar";
import { PortalBottomNav } from "@/components/portal-bottom-nav";
import { SWRProvider } from "@/components/swr-provider";
import {
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/server";
import { Separator } from "@/components/ui/separator";
import { Suspense } from "react";
import { HydrationSafe } from "@/components/hydration-safe";

async function FirmName({ params }: { params: Promise<{ firmId: string }> }) {
  const { firmId } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("firms")
    .select("name")
    .eq("id", firmId)
    .single();

  return (
    <span className="text-sm font-semibold truncate max-w-[200px]">
      {data?.name || "Unknown Firm"}
    </span>
  );
}

async function SidebarByRole() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user?.id
    ? await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()
    : { data: null };

  const isPortalUser = profile?.role === "client";

  return (
    <>
      {isPortalUser ? (
        /* Hide sidebar on mobile for portal users — bottom nav is used instead */
        <div className="hidden md:contents">
          <PortalSidebar />
        </div>
      ) : (
        <FirmSidebar />
      )}
      {isPortalUser && <PortalBottomNav />}
    </>
  );
}

export default function FirmIdLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ firmId: string }>;
}) {
  return (
    <SWRProvider>
      <Suspense
        fallback={
          <div className="w-[--sidebar-width] bg-sidebar border-r h-screen" />
        }
      >
        <HydrationSafe
          fallback={
            <div className="w-[--sidebar-width] bg-sidebar border-r h-screen" />
          }
        >
          <SidebarByRole />
        </HydrationSafe>
      </Suspense>
      <SidebarInset>
        <header className="shrink-0 border-b" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="flex h-16 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1 hidden md:flex" />
          <Separator
            orientation="vertical"
            className="mr-2 hidden h-4 md:block"
          />
          <div className="flex items-center gap-2 px-4">
            <Suspense
              fallback={
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              }
            >
              <FirmName params={params} />
            </Suspense>
          </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pb-20 md:pb-4">
          {children}
        </div>
      </SidebarInset>
    </SWRProvider>
  );
}

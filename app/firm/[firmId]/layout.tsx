import { FirmSidebar } from "@/components/firm-sidebar";
import { 
  SidebarInset, 
  SidebarTrigger 
} from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/server";
import { Separator } from "@/components/ui/separator";
import { Suspense } from "react";

/**
 * Fetches and displays the firm name.
 * Because it's wrapped in Suspense, it won't block the Sidebar shell.
 */
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

export default function FirmLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ firmId: string }>;
}) {
  return (
    <>
      <Suspense fallback={<div className="w-[--sidebar-width] bg-sidebar border-r h-screen" />}>
        <FirmSidebar />
      </Suspense>
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2 px-4">
            <span className="text-sm font-medium text-muted-foreground">用戶:</span>
            <Suspense fallback={<div className="h-4 w-32 bg-muted animate-pulse rounded" />}>
              <FirmName params={params} />
            </Suspense>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4">
          {children}
        </div>
      </SidebarInset>
    </>
  );
}

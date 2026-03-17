"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Home, LogOut, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function PortalBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { firmId, clientId } = useParams() as {
    firmId: string;
    clientId: string;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  const portalHome = `/firm/${firmId}/client/${clientId}/portal`;
  const isHome = pathname === portalHome;
  const isPeriod = pathname.includes("/portal/period/");

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-sm md:hidden">
      <div
        className="mx-auto flex h-16 max-w-md items-center justify-around"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <Link
          href={portalHome}
          className={`flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium transition-colors ${
            isHome
              ? "text-emerald-600"
              : "text-slate-500 active:text-emerald-600"
          }`}
        >
          <Home className="h-5 w-5" />
          <span>首頁</span>
        </Link>

        <Link
          href={portalHome}
          className={`flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium transition-colors ${
            isPeriod
              ? "text-emerald-600"
              : "text-slate-500 active:text-emerald-600"
          }`}
        >
          <Upload className="h-5 w-5" />
          <span>上傳</span>
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          className="flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium text-slate-500 transition-colors active:text-red-600"
        >
          <LogOut className="h-5 w-5" />
          <span>登出</span>
        </button>
      </div>
    </nav>
  );
}

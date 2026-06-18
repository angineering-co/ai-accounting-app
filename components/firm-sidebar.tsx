"use client";

import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  LogOut,
  BookOpen,
  Scale,
  TrendingUp,
  FolderOpen,
  CreditCard,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function FirmSidebar() {
  const router = useRouter();
  const supabase = createClient();
  const params = useParams() as { firmId: string; clientId?: string };
  const { firmId, clientId } = params;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  const items = [
    { title: "首頁", url: `/firm/${firmId}/dashboard`, icon: LayoutDashboard },
    { title: "客戶管理", url: `/firm/${firmId}/client`, icon: Users },
    { title: "發票管理", url: `/firm/${firmId}/invoice`, icon: FileText },
    { title: "收款", url: `/firm/${firmId}/payment-link`, icon: CreditCard },
    { title: "設定", url: `/firm/${firmId}/settings`, icon: Settings },
  ];

  // 客戶子模組：僅在 URL 含 clientId 時顯示。
  const clientItems = clientId
    ? [
        {
          title: "傳票",
          url: `/firm/${firmId}/client/${clientId}/voucher`,
          icon: BookOpen,
        },
        {
          title: "其他文件",
          url: `/firm/${firmId}/client/${clientId}/documents`,
          icon: FolderOpen,
        },
        {
          title: "損益表",
          url: `/firm/${firmId}/client/${clientId}/reports/income-statement`,
          icon: TrendingUp,
        },
        {
          title: "資產負債表",
          url: `/firm/${firmId}/client/${clientId}/reports/balance-sheet`,
          icon: Scale,
        },
      ]
    : [];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={`/firm/${firmId}/dashboard`}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <LayoutDashboard className="size-4" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold text-lg">AI Accounting</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sm">管理模組</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title} className="text-base">
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {clientItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sm">客戶子模組</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {clientItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title} className="text-base">
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} className="text-base text-destructive hover:text-destructive hover:bg-destructive/10">
              <LogOut className="size-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

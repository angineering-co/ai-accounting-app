import { SidebarProvider } from "@/components/ui/sidebar";

export default async function FirmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarProvider>{children}</SidebarProvider>;
}

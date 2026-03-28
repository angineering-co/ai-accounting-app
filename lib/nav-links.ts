import { FileText, ClipboardCheck, type LucideIcon } from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
}

export interface ToolLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const navLinks: NavLink[] = [
  { href: "/#features", label: "服務介紹" },
  { href: "/#pricing", label: "價格" },
  { href: "/blog", label: "部落格" },
  { href: "/faq", label: "常見問題" },
];

export const tools: ToolLink[] = [
  {
    href: "/tools/invoice-helper",
    label: "手開發票小幫手",
    icon: FileText,
  },
  {
    href: "/tools/company-setup-check",
    label: "公司設立健檢",
    icon: ClipboardCheck,
  },
];

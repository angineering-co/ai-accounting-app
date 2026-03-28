import { FileText, type LucideIcon } from "lucide-react";

export interface ToolLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const tools: ToolLink[] = [
  {
    href: "/tools/invoice-helper",
    label: "手開發票小幫手",
    icon: FileText,
  },
];

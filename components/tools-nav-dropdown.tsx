"use client";

import Link from "next/link";
import { ChevronDown, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const tools = [
  {
    href: "/tools/invoice-helper",
    label: "手開發票小幫手",
    icon: FileText,
  },
];

export function ToolsNavDropdown() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-0.5 hover:text-slate-900 transition-colors outline-none">
        小工具
        <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8}>
        {tools.map((tool) => (
          <DropdownMenuItem key={tool.href} asChild>
            <Link href={tool.href} className="flex items-center gap-2 cursor-pointer">
              <tool.icon className="h-4 w-4 text-slate-500" />
              {tool.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

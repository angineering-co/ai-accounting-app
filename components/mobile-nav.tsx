"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { navLinks, tools } from "@/lib/nav-links";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="開啟選單"
        className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="right" className="w-64 pt-10">
        <SheetTitle className="sr-only">導覽選單</SheetTitle>
        <nav className="flex flex-col gap-1 text-base font-medium text-slate-600">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="hover:text-slate-900 transition-colors py-2"
            >
              {link.label}
            </Link>
          ))}

          {/* 小工具 section */}
          <div className="pt-2 border-t border-slate-100 mt-2">
            <span className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              小工具
            </span>
            <div className="mt-1 flex flex-col gap-1">
              {tools.map((tool) => (
                <Link
                  key={tool.href}
                  href={tool.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 hover:text-slate-900 transition-colors py-2 pl-1"
                >
                  <tool.icon className="h-4 w-4 text-slate-400" />
                  {tool.label}
                </Link>
              ))}
            </div>
          </div>

          {/* 登入 */}
          <div className="pt-2 border-t border-slate-100 mt-2">
            <Link
              href="/auth/login"
              onClick={() => setOpen(false)}
              className="hover:text-slate-900 transition-colors py-2 inline-block"
            >
              登入
            </Link>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

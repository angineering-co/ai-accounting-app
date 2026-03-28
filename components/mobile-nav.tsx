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

const navLinks = [
  { href: "/#features", label: "服務介紹" },
  { href: "/#pricing", label: "價格" },
  { href: "/blog", label: "部落格" },
  { href: "/faq", label: "常見問題" },
  { href: "/tools/invoice-helper", label: "手開發票小幫手" },
  { href: "/auth/login", label: "登入" },
];

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
        <nav className="flex flex-col gap-4 text-base font-medium text-slate-600">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="hover:text-slate-900 transition-colors py-1"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

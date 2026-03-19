import Link from "next/link";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { CtaLink } from "@/components/cta-link";
import { CurrentYear } from "@/components/current-year";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctaHref =
    process.env.NEXT_PUBLIC_EARLY_ADOPTER_FORM_URL ?? "#signup-unavailable";

  return (
    <div className="flex min-h-screen flex-col bg-white selection:bg-emerald-100 selection:text-emerald-900 font-sans text-slate-900">
      {/* Sticky Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-100/50 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
          <Link href="/" aria-label="SnapBooks.ai">
            <Image
              src="/snapbooks.svg"
              alt="SnapBooks.ai 速博 Logo"
              width={182}
              height={60}
              className="h-10 w-auto"
            />
          </Link>
          <div className="flex items-center gap-4 md:gap-6">
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <Link
                href="/#features"
                className="hover:text-slate-900 transition-colors"
              >
                服務介紹
              </Link>
              <Link
                href="/#pricing"
                className="hover:text-slate-900 transition-colors"
              >
                價格
              </Link>
              <Link
                href="/blog"
                className="hover:text-slate-900 transition-colors"
              >
                部落格
              </Link>
              <Link
                href="/auth/login"
                className="hover:text-slate-900 transition-colors"
              >
                登入
              </Link>
            </nav>
            <Link
              href="/auth/login"
              className="md:hidden text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              登入
            </Link>
            <Button
              asChild
              size="sm"
              className="rounded-full bg-emerald-500 text-white hover:bg-slate-800 font-medium"
            >
              <CtaLink href={ctaHref} location="nav">
                免費評估適用方案
              </CtaLink>
            </Button>
          </div>
        </div>
      </header>

      {children}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12 md:py-16">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-8 px-5 md:flex-row md:items-start md:gap-0">
          <div className="flex flex-col items-center md:items-start gap-4">
            <Image
              src="/snapbooks.svg"
              alt="SnapBooks.ai 速博 Logo"
              width={182}
              height={60}
              className="h-10 w-auto"
            />
            <div className="text-sm text-slate-500 text-center md:text-left leading-relaxed">
              <p className="font-medium text-slate-700">
                SnapBooks.ai 速博智慧有限公司｜速博智慧記帳事務所
              </p>
              <p>地址：台中市西區五權路1-67號11樓之5</p>
              <p>電子信箱：snapbooks.ai@gmail.com</p>
            </div>
          </div>

          <div className="flex flex-col items-center md:items-end gap-6">
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm font-medium text-slate-500">
              <Link
                href="/terms"
                className="hover:text-slate-900 transition-colors"
              >
                服務條款
              </Link>
              <Link
                href="/privacy"
                className="hover:text-slate-900 transition-colors"
              >
                隱私權政策
              </Link>
              <Link
                href="/company"
                className="hover:text-slate-900 transition-colors"
              >
                關於我們
              </Link>
              <Link
                href="/blog"
                className="hover:text-slate-900 transition-colors"
              >
                部落格
              </Link>
            </div>

            <div className="text-sm text-slate-400">
              &copy; <CurrentYear /> SnapBooks.ai. 速博智慧有限公司 版權所有。
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

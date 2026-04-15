import Link from "next/link";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { CtaLink } from "@/components/cta-link";
import { CurrentYear } from "@/components/current-year";
import { ToolsNavDropdown } from "@/components/tools-nav-dropdown";
import { MobileNav } from "@/components/mobile-nav";
import { navLinks } from "@/lib/nav-links";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
            <nav className="hidden md:flex items-center gap-6 text-base font-medium text-slate-600">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hover:text-slate-900 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <ToolsNavDropdown />
              <Link
                href="/auth/login"
                className="hover:text-slate-900 transition-colors"
              >
                登入
              </Link>
            </nav>
            <MobileNav />
            <Button
              asChild
              size="sm"
              className="rounded-full bg-emerald-500 text-white hover:bg-slate-800 font-medium"
            >
              <CtaLink href="/apply" location="nav">
                免費諮詢
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
              <Link
                href="/faq"
                className="hover:text-slate-900 transition-colors"
              >
                常見問題
              </Link>
              <Link
                href="/startup-guide"
                className="hover:text-slate-900 transition-colors"
              >
                創業必看
              </Link>
              <Link
                href="/tools/invoice-helper"
                className="hover:text-slate-900 transition-colors"
              >
                手開發票小幫手
              </Link>
              <Link
                href="/tools/company-setup-check"
                className="hover:text-slate-900 transition-colors"
              >
                公司設立健檢
              </Link>
              <Link
                href="/tools/withholding-tax-calculator"
                className="hover:text-slate-900 transition-colors"
              >
                扣繳計算機
              </Link>
              <Link
                href="/tools/incorporation-flow"
                className="hover:text-slate-900 transition-colors"
              >
                開公司流程圖
              </Link>
              <Link
                href="/tools/insurance-calculator"
                className="hover:text-slate-900 transition-colors"
              >
                勞健保計算機
              </Link>
            </div>

            <div className="text-sm text-slate-400">
              &copy; <CurrentYear /> SnapBooks.ai. 速博智慧有限公司 版權所有。
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Line "Add Friend" button */}
      <a
        href="https://lin.ee/nPVmG3M"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="加入 Line 好友"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#06C755] shadow-lg shadow-black/15 transition-transform hover:scale-110"
      >
        <svg viewBox="0 0 24 24" className="h-8 w-8 fill-white" aria-hidden="true">
          <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
        </svg>
      </a>
    </div>
  );
}

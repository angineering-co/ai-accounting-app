"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Calculator, GitBranch, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bodyRelaxed, secondary } from "@/lib/styles/tools";

const STORAGE_KEY = "startup-guide-progress";

const steps = [
  {
    slug: "company-setup-check",
    href: "/tools/company-setup-check",
    icon: ClipboardCheck,
    title: "公司設立健檢",
    description:
      "開公司的目的是什麼？獲取專屬的法律與稅務建議，決定要開行號還是開公司。",
    time: "1-5 分鐘",
  },
  {
    slug: "tax-calculator",
    href: "/tools/tax-calculator",
    icon: Calculator,
    title: "創業節稅試算",
    description:
      "了解行號與公司差異後，再進一步計算您的稅負差異，從源頭節稅。",
    time: "2 分鐘",
  },
  {
    slug: "incorporation-flow",
    href: "/tools/incorporation-flow",
    icon: GitBranch,
    title: "開公司流程圖",
    description:
      "一次搞懂行號與公司的設立流程、時間與注意事項，從名稱預查到稅籍登記。",
    time: "3 分鐘",
  },
];

type Progress = Record<string, boolean>;

function readProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeProgress(progress: Progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* noop */
  }
}

export function StartupGuideHub() {
  const [progress, setProgress] = useState<Progress>({});

  useEffect(() => {
    setProgress(readProgress());

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setProgress(readProgress());
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const completedCount = steps.filter((s) => progress[s.slug]).length;

  function handleClick(slug: string) {
    const next = { ...progress, [slug]: true };
    setProgress(next);
    writeProgress(next);
  }

  return (
    <div className="space-y-8">
      {completedCount > 0 && (
        <div className="flex items-center justify-center gap-3">
          <div className="h-2 flex-1 max-w-xs rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
          <span className={`${secondary} font-medium`}>
            {completedCount}/{steps.length} 完成
          </span>
        </div>
      )}

      <div className="grid gap-6">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const done = !!progress[step.slug];

          return (
            <div
              key={step.slug}
              className={`group overflow-hidden rounded-2xl border bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-lg md:p-8 ${
                done
                  ? "border-emerald-200 bg-emerald-50/30"
                  : "border-slate-200 hover:border-emerald-200"
              }`}
            >
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:gap-8">
                <div className="flex shrink-0 items-center gap-4 md:flex-col md:items-center md:gap-2">
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
                    <Icon className="h-6 w-6" />
                    <span className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-bold text-emerald-700 shadow-sm ring-2 ring-emerald-100">
                      {i + 1}
                    </span>
                  </div>
                  {done && (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  )}
                </div>

                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <h3 className="font-display text-xl font-bold text-slate-900 md:text-2xl">
                      {step.title}
                    </h3>
                    <span className={`inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-0.5 font-medium ${secondary}`}>
                      {step.time}
                    </span>
                  </div>
                  <p className={bodyRelaxed}>
                    {step.description}
                  </p>
                  <Button
                    asChild
                    variant="outline"
                    className="group/btn mt-2 rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    <Link
                      href={step.href}
                      onClick={() => handleClick(step.slug)}
                    >
                      {done ? "再看一次" : "開始使用"}
                      <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

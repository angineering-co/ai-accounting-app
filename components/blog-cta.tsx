import { LINE_URL } from "@/lib/pricing";

interface BlogCtaProps {
  title: string;
  children: React.ReactNode;
}

export function BlogCta({ title, children }: BlogCtaProps) {
  return (
    <div className="not-prose mt-12 rounded-2xl bg-emerald-50 p-8">
      <p className="text-lg font-semibold text-emerald-800">{title}</p>
      <div className="mt-2 text-lg leading-relaxed text-emerald-700 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_li]:text-emerald-700">
        {children}
      </div>
      <p className="mt-4 text-lg leading-relaxed text-emerald-700">
        想聊聊你的記帳需求？直接加我們的{" "}
        <a
          href={LINE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 font-semibold text-white hover:bg-emerald-700"
        >
          Line
        </a>
        ，或{" "}
        <a
          href="/apply"
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 px-3 py-1 font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          取得報價
        </a>
      </p>
    </div>
  );
}

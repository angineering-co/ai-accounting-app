import type { Metadata } from "next";
import Link from "next/link";

import { getPublishedPosts } from "@/content/blog";

export const metadata: Metadata = {
  title: "部落格｜速博 SnapBooks.ai - AI 記帳事務所",
  description:
    "速博 SnapBooks.ai 部落格：AI 記帳、中小企業報稅、台灣稅務知識分享。",
  alternates: { canonical: "https://snapbooks.ai/blog" },
};

export default async function BlogListingPage() {
  const posts = await getPublishedPosts();

  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-sky-50 via-slate-50 to-emerald-50 pt-20 pb-16 md:pt-28 md:pb-20">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03]" />
        <div className="relative mx-auto max-w-3xl px-5">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
            部落格
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            AI 記帳、中小企業報稅、台灣稅務知識分享
          </p>
        </div>
      </section>

      {/* Posts */}
      <section className="mx-auto max-w-3xl px-5 py-16 md:py-20">
        <div className="space-y-12">
          {posts.map((post) => (
            <article key={post.slug}>
              <Link href={`/blog/${post.slug}`} className="group block">
                <time className="text-sm font-medium text-slate-400">
                  {post.date}
                </time>
                <h2 className="mt-2 text-2xl font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                  {post.title}
                </h2>
                <p className="mt-3 text-lg leading-relaxed text-slate-600">
                  {post.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <span className="mt-4 inline-block text-sm font-semibold text-emerald-600 group-hover:underline">
                  閱讀全文 →
                </span>
              </Link>
            </article>
          ))}
        </div>

        {posts.length === 0 && (
          <p className="text-lg text-slate-500">目前還沒有文章，敬請期待！</p>
        )}
      </section>
    </main>
  );
}

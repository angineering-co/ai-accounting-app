import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { getPostBySlug, getPublishedPosts } from "@/content/blog";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getPublishedPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return {
    title: `${post.title}｜速博 SnapBooks.ai`,
    description: post.description,
    alternates: { canonical: `https://snapbooks.ai/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      siteName: "SnapBooks.ai",
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const { default: Content } = await import(`@/content/blog/${slug}`);

  return (
    <main className="flex-1">
      {/* Hero banner */}
      <section className="relative overflow-hidden bg-gradient-to-br from-sky-50 via-slate-50 to-emerald-50 pt-20 pb-16 md:pt-28 md:pb-20">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03]" />
        <div className="relative mx-auto max-w-3xl px-5">
          <Link
            href="/blog"
            className="mb-6 inline-flex items-center text-sm font-medium text-slate-500 hover:text-emerald-600 transition-colors"
          >
            ← 返回部落格
          </Link>
          <time className="block text-sm font-medium text-slate-400">
            {post.date}
          </time>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-4xl lg:text-5xl">
            {post.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-600">
              {post.author}
            </span>
            <span className="text-slate-300">|</span>
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Article content */}
      <article className="mx-auto max-w-3xl px-5 py-16 md:py-20">
        <Content />
      </article>
    </main>
  );
}

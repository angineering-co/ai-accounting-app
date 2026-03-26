import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import { blogSlugs, getPostBySlug } from "@/content/blog";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return blogSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
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
      ...(post.coverImage && {
        images: [{ url: `https://snapbooks.ai${post.coverImage}`, width: 1200, height: 630 }],
      }),
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const { default: Content } = await import(`@/content/blog/${slug}.mdx`);

  return (
    <main className="flex-1">
      {/* Post header */}
      <header className="mx-auto max-w-3xl px-5 pt-10 md:pt-14">
        <Link
          href="/blog"
          className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-emerald-600 transition-colors"
        >
          ← 返回部落格
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-400">
          <time>{post.date}</time>
          <span>·</span>
          <span className="font-medium text-slate-600">{post.author}</span>
        </div>
        <h1 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-3xl lg:text-4xl">
          {post.title}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
            >
              {tag}
            </span>
          ))}
        </div>
      </header>

      {/* Cover image */}
      {post.coverImage && (
        <div className="mx-auto max-w-3xl px-5 pt-10 md:pt-14">
          <Image
            src={post.coverImage}
            alt={post.title}
            width={1200}
            height={630}
            className="w-full rounded-2xl"
            priority
          />
        </div>
      )}

      {/* Article content */}
      <article className="prose prose-lg prose-slate mx-auto max-w-3xl px-5 py-16 md:py-20 prose-headings:font-bold prose-headings:text-slate-900 prose-a:text-emerald-600 prose-a:underline hover:prose-a:text-emerald-700 prose-li:marker:text-emerald-500 prose-table:overflow-hidden prose-table:rounded-xl prose-table:border prose-table:border-slate-200 prose-thead:bg-slate-50 prose-th:px-4 prose-th:py-3 prose-th:font-semibold prose-th:text-slate-800 prose-td:px-4 prose-td:py-3 prose-td:text-slate-600 first:[&_td]:whitespace-nowrap">
        <Content />
      </article>
    </main>
  );
}

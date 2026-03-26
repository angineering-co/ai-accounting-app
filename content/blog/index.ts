export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  author: string;
  tags: string[];
  /** Path relative to /public, e.g. "/blog/my-post.webp" */
  coverImage?: string;
}

/**
 * Register blog post slugs here. Metadata is pulled from each MDX file's
 * `export const metadata` at build time via dynamic import in the page route.
 *
 * Order doesn't matter — getPublishedPosts() sorts by date descending.
 */
export const blogSlugs: string[] = [
  "what-is-labor-report",
  "company-taxes-2026-guide",
  "why-ai-accounting-firm-not-saas",
  "ai-accounting-firm-taiwan",
  "what-is-book-review-tax",
  "business-tax-vat-guide",
  "business-income-tax-guide",
];

export async function getPublishedPosts(): Promise<BlogPost[]> {
  const posts = await Promise.all(
    blogSlugs.map(async (slug) => {
      const mod = await import(`./${slug}.mdx`);
      return mod.metadata as BlogPost;
    })
  );
  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export async function getPostBySlug(
  slug: string
): Promise<BlogPost | undefined> {
  if (!blogSlugs.includes(slug)) return undefined;
  const mod = await import(`./${slug}.mdx`);
  return mod.metadata as BlogPost;
}

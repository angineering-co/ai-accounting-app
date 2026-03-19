export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  author: string;
  tags: string[];
  published: boolean;
}

export const blogPosts: BlogPost[] = [
  {
    slug: "ai-accounting-firm-taiwan",
    title: "什麼是 AI 記帳事務所？台灣中小企業的全新選擇",
    description:
      "了解 AI 記帳事務所如何結合人工智慧與專業會計師，為台灣中小企業提供更高效、更實惠的記帳報稅服務。",
    date: "2026-03-19",
    author: "SnapBooks.ai 團隊",
    tags: ["AI 記帳", "中小企業", "報稅"],
    published: true,
  },
];

export function getPublishedPosts(): BlogPost[] {
  return blogPosts
    .filter((p) => p.published)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug && p.published);
}

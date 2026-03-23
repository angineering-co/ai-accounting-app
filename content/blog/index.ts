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
    slug: "company-taxes-2026-guide",
    title: "2026 公司報稅，你到底要繳哪些稅？",
    description:
      "營業稅、營所稅、扣繳、暫繳、二代健保、未分配盈餘稅，六大稅種的申報時間、算法、罰則一次講完。2026 年公司和行號報稅完整指南。",
    date: "2026-03-23",
    author: "SnapBooks.ai 團隊",
    tags: ["報稅", "營業稅", "營所稅", "中小企業"],
    published: true,
  },
  {
    slug: "why-ai-accounting-firm-not-saas",
    title: "為什麼做 AI 記帳事務所，而不是另一套記帳軟體",
    description:
      "全球 AI 記帳市場破百億美元，台灣中小企業卻還在觀望。SnapBooks.ai 不做記帳軟體，而是用 AI 打造新型態記帳事務所——拍照上傳、AI 分類、會計師複核，每月 NT$1,200 起。",
    date: "2026-03-20",
    author: "SnapBooks.ai 團隊",
    tags: ["AI 記帳", "AI 記帳事務所", "中小企業記帳", "記帳報稅"],
    published: true,
  },
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

---
name: blog-post
description: Create a new blog post for SnapBooks.ai. Use this skill whenever the user wants to write, add, or publish a blog post, or provides blog content to turn into a post. Also trigger when the user says "new blog", "write an article", or provides article text and asks you to add it to the site.
---

# Blog Post Creator

Create blog posts for the SnapBooks.ai website. The user provides the article content (usually in plain text or markdown); you turn it into an `.mdx` file and register the slug in the blog index.

## Steps

### 1. Understand the existing patterns

Read these files to match the current structure:
- `content/blog/index.ts` — the `BlogPost` interface and `blogSlugs` array
- Any existing `.mdx` file in `content/blog/` for structure reference

### 2. Create the MDX file

Create `content/blog/<slug>.mdx` where `<slug>` is a kebab-case version of the topic.

The file starts with an import of the CTA component and an exported `metadata` object, followed by plain markdown content:

```mdx
import { BlogCta } from "@/components/blog-cta";

export const metadata = {
  slug: "the-slug",
  title: "文章標題",
  description: "SEO description, 1-2 sentences summarizing the post.",
  date: "YYYY-MM-DD",  // today's date
  author: "SnapBooks.ai 團隊",
  tags: ["tag1", "tag2"],  // 3-5 relevant tags in Chinese
};

開頭段落直接寫，不用 H1（頁面會自動從 metadata.title 渲染標題）。

## H2 標題

正文直接用 markdown 語法。**粗體**、*斜體*、[連結](https://...)、列表、表格都照標準 markdown 寫。

### H3 標題

- 列表項目一
- 列表項目二

| 欄位一 | 欄位二 |
| --- | --- |
| 值 | 值 |

<BlogCta title="CTA 標題">

CTA 內文，1-2 句連結文章主題到 SnapBooks.ai 的價值。可以用 markdown 語法。
Line 和免費諮詢連結由組件自動帶入，不需要在這裡寫。

</BlogCta>
```

### 3. Important MDX formatting rules

- **No JSX needed for content.** Write standard markdown — headings, bold, lists, tables, links all work natively. The `prose` class on the article wrapper handles all styling.
- **Only use JSX for the `<BlogCta>` component** at the end of the post. No other components should be needed for typical posts.
- **Leave blank lines around JSX components.** MDX requires blank lines before and after any JSX block (like `<BlogCta>`), and also around markdown content *inside* JSX components, otherwise the markdown won't be parsed.
- **Tables use standard GFM syntax** (pipe-separated, with `| --- |` separator row). `remark-gfm` handles rendering.

### 4. CTA guidelines

Every blog post ends with a `<BlogCta>` block. The CTA should feel natural to the article topic — not a generic product pitch. The reader is already on our site, so don't direct them to snapbooks.ai.

The `<BlogCta>` component automatically appends a closing paragraph with Line and free consultation links (styled as buttons). Only write the contextual body text — do **not** add the Line/consultation links manually.

### 5. Register the slug

Add the new slug to the `blogSlugs` array in `content/blog/index.ts`. Order doesn't matter — `getPublishedPosts()` sorts by date descending.

### 6. Cover image

The user generates the cover image separately. After the user provides the image file, process it:

1. **Optimize**: Resize to 1200px wide and convert to WebP using sharp-cli:
   ```bash
   mkdir -p public/blog
   npx sharp-cli -i <source-image> -o public/blog/<slug>.webp -f webp --quality 80 resize 1200
   ```
2. **Delete the original** unoptimized image to avoid bloating the repo.
3. **Add `coverImage` to metadata** in the MDX file:
   ```js
   coverImage: "/blog/<slug>.webp",
   ```

The blog post page (`app/(landing)/blog/[slug]/page.tsx`) already renders the cover image below the hero and includes it in OpenGraph metadata. No code changes needed.

**To help the user generate the image**, output an image-generation prompt in a fenced code block they can paste into their preferred tool (e.g. Nano Banana, Midjourney, Ideogram):
- Describe a scene that visually represents the blog post topic
- Include any Traditional Chinese text that should appear — spell out exact characters (e.g. `「營業稅」`)
- Specify: flat/modern illustration style, 16:9 aspect ratio, blog hero image
- Calm, professional color palette (soft blues, whites, light grays) with accent colors
- No photorealistic elements
- Under 200 words

### 7. Originality rules

When the user provides a reference article or URL as source material:

- **Do not copy examples verbatim.** Create original examples with different scenarios, amounts, and characters. For instance, if the source uses a 設計師 with 21,000 + 17,000 payments, write a new scenario with a different profession and different numbers.
- **Rewrite explanations in your own words.** Use the source for factual accuracy, but the phrasing and structure should be original.

### 8. Add references

If the blog post cites specific tax rates, thresholds, legal requirements, or government regulations, add a `## 參考資料` section before the `<BlogCta>` block. List official government sources that back up the claims, using markdown links:

```markdown
## 參考資料

- [法規或資料名稱](https://...) — 機關名稱，簡短說明
```

**Only use `.gov.tw` domains.** Government sources are far more credible than blogs or third-party sites. Use WebFetch to verify each URL actually contains the relevant content before including it. Prioritize:
- 財政部 / 國稅局 / 稅務入口網 — etax.nat.gov.tw, mof.gov.tw (tax law, withholding rates)
- 勞動部 — mol.gov.tw (minimum wage, labor regulations)
- 衛福部 / 健保署 — mohw.gov.tw, nhi.gov.tw (NHI premiums)
- 全國法規資料庫 — law.moj.gov.tw (full text of laws)

### 9. Writing style rules

- Content is in Traditional Chinese (zh-Hant)
- Never use `——` (double em-dash). It reads as AI-generated. Use standard Chinese punctuation: `，`、`。`、`：`、`；` or sentence breaks
- Do not add emojis unless the user explicitly asks for them
- Keep the tone conversational and direct, like explaining to a friend who runs a small business
- Use `...` (three dots) instead of `⋯⋯` if an ellipsis is needed

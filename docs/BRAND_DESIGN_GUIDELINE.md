# SnapBooks.ai Design Guideline

This document defines the visual and messaging system for SnapBooks.ai (速博 / 速博智慧記帳事務所) so future assets — landing pages, social cards, in-app screens, marketing collateral — stay consistent.

## 1) Brand Core

- **Brand name:** `SnapBooks.ai` — always this exact casing. Never `Snapbooks`, `SNAPBOOKS`, or `snapbooks`. Chinese alias: **速博**.
- **Category:** AI-enabled accounting workflow for one-person companies and small teams in Taiwan
- **Primary promise:** reduce offline paperwork friction — paper receipts, mailing, manual handoff become "拍照上傳"
- **Tone:** trustworthy, practical, calm, clear — not playful, not cheeky, not "fun startup"
- **Voice POV:** the brand speaks as `我們`. Address the reader as `您` in marketing surfaces, `你` inside the product. Never `I`.
- **Pricing reference:** `NT$1,260 / 月起` (with comma; full-width `／` is fine in zh-TW context).

## 2) Voice & Copy

### Headline patterns
Short, problem-framed, often with a hard line break before a brand-gradient phrase.

- `記帳報稅，` / `交給我們就好` (gradient on the second line)
- `為什麼選擇 SnapBooks`
- `顛覆業界的透明定價`
- `準備開公司？三步搞懂創業大小事`

### CTA copy (canonical)

- **Primary:** `立即申請` · `取得報價` · `立即加入早期試用` · `立即填寫早期試用表單`
- **Secondary / nav:** `登入` · `查看完整價格方案` · `開始創業攻略`
- **Promo chip:** `加入 Line 好友，享設立登記 NT$1,000 折扣`
- **Never use:** `Sign up`, `Get started`, `Click here`, `Learn more` — no English filler.

### Body copy

- 1–2 sentences per block. Concrete pain language: `紙本發票隨手拍照上傳`, not `streamline receipt management`.
- Bullet style: `✓` checkmark + concrete claim. Avoid abstract benefits like `增加效率`; prefer specifics like `十年經驗的專業團隊逐筆覆核`.
- Numbers carry weight: `每月 $1,260`, `年營業額 3,000 萬以下`, `每月最多 50 張紙本發票`.

### Punctuation rules

- No emoji in product or marketing surfaces. Iconography is Lucide line icons only.
- Use full-width zh-TW punctuation: `，` `。` `？` `！` (not Latin `.` `,` `?`).
- Pricing dashes use the em-dash `—`, not `-`.
- Avoid `——` ASCII fake-em-dashes; prefer natural punctuation breaks.

## 3) Color System

**Blue-led trust, green-led success/CTA — but in this product, green is louder than blue.** Emerald is the primary action color; sky/blue is reserved for backgrounds, links, and secondary surfaces.

### Action / interactive

- **Primary CTA:** Emerald `#059669` rest → `#10B981` hover. All buttons that drive conversion or confirm.
- **Primary CTA shadow:** `shadow-lg shadow-emerald-600/25` rest → `shadow-emerald-600/30` hover.
- **Brand gradient phrase (text):** `from-emerald-600 to-teal-500` with `bg-clip-text text-transparent`.

### Surfaces

- **Default page background:** white `#FFFFFF`.
- **Alternating section background:** slate-50 `#F8FAFC`.
- **Hero gradient wash:** `from-emerald-50 via-slate-50 to-sky-50`.
- **Decorative blobs:** `bg-emerald-200/30 blur-3xl` positioned at corners, used for atmosphere not as content.
- **Grain overlay:** ~3% opacity SVG fractal-noise on hero / final CTA sections. See `app/globals.css` `.grain::after`.

### Text

- **Headings:** slate-900 `#0F172A`.
- **Body:** slate-700 `#334155`.
- **Lead / intro paragraph:** slate-600.
- **Small / muted:** slate-500.

### Borders

- Cards: 1px slate-200.
- Form inputs: 2px slate-300 (heavier so fields read as interactive).
- Active / selected callout: emerald-200.
- Table row dividers: `border-t border-slate-100` (very light).

### Brand-only tones (do not use in product UI)

- **Mint-cream backplate** for the icon: `#ECFDF5 → #D1FAE5`.
- **Emerald gradient check:** `#10B981 → #059669` (the check in the mark).
- **LINE green:** `#06C755` for the floating LINE button only — not a brand color.

## 4) Typography

### Families

- **Display (marketing H1/H2/H3):** **Noto Serif TC** at 700 / 900. Use class `font-display`. Loaded via `next/font/google` in `app/layout.tsx`.
- **Body / UI:** **Geist** sans (Google Fonts). Default for everything else.
- **Mono:** Geist Mono via `font-mono`. Used in invoice numbers, IDs.

### Display patterns

- Marketing headlines mix slate-900 with a gradient phrase: `<span class="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">交給我們就好</span>`.
- Often with a hard line break before the gradient phrase.

### Sizing rules

- **Default body:** `text-base` (16px). Use this for all body text, labels, descriptions, form fields, table content, navigation items.
- **Secondary / supplementary:** `text-sm` (14px) — captions, hints, metadata, muted helper text only.
- **Never use `text-xs`** (12px) in app-owned components. Minimum readable size is `text-sm`.
- shadcn/ui primitives in `components/ui/` keep upstream defaults — override sizes at the usage site if needed.

## 5) Spacing & Layout

- **Scale:** 4px (Tailwind default). All spacing values resolve to multiples of 4.
- **Section vertical rhythm:** marketing sections use `py-24` to `py-36`; cards use `py-6` internally.
- **Containers:**
  - Default content rail: `max-w-5xl` (1024px).
  - Hero text: `max-w-4xl`.
  - Body lead paragraph: `max-w-2xl`.
  - FAQ list: `max-w-3xl`.
- **Grid rhythms:** alternating image-left / image-right rows in feature tour; 4-step timeline grids; 3-up step grids.

## 6) Corner Radii, Shadows, Elevation

### Radii

- **Buttons:**
  - Marketing primary: `rounded-full`.
  - In-app shadcn buttons: `rounded-md` (8px).
- **Cards:** `rounded-xl` (12px) standard. `rounded-3xl` (24px) for hero callouts. `rounded-[2.5rem]` (40px) for the pricing hero card.
- **Inputs:** `rounded-md`.
- **Phone bezels** (marketing): `rounded-[1.5rem]` outer, `rounded-[1.25rem]` inner.

### Shadows

- **Cards:** `shadow` or `shadow-sm`.
- **Pricing hero card:** `shadow-2xl shadow-slate-200/50` — a soft halo, not punch.
- **CTAs:** colored shadow tinted to the button — `shadow-lg shadow-emerald-600/25`.
- **No inner shadows.** No neumorphism. No multi-layer glow stacks.

### Transparency / blur

- Sticky header: `bg-white/80 backdrop-blur-md`.
- Promo chips on hero: `bg-white/70 backdrop-blur-sm` with `border-emerald-200/60`.
- Decorative blobs: `blur-3xl` at 20–40% opacity.
- Cards are never transparent — always solid white.

## 7) Animation

- **Custom emphasis easing:** `cubic-bezier(0.16, 1, 0.3, 1)` — "spring-out". Standard easing: `cubic-bezier(0.4, 0, 0.2, 1)`.
- **Patterns:**
  - `fade-up 0.8s` — staggered entrance for hero blocks (delays 100 / 200 / 300ms).
  - `fade-in 0.6s` — gentle.
  - `gradient-shift 8s infinite` — for animated gradients.
  - `float 6s ease-in-out infinite` — subtle vertical bob, used sparingly.
- **Hover transforms:** `hover:-translate-y-0.5` on buttons + cards; `group-hover:translate-x-1` on inline arrows; `hover:scale-105` on portrait avatars.
- **Default hover duration:** `duration-300`.
- **No press / active states are explicitly styled** — rely on browser default opacity dim.

## 8) Iconography

- **Library:** [Lucide React](https://lucide.dev) (`lucide-react`). The codebase's `components.json` declares `"iconLibrary": "lucide"`.
- **Defaults:** stroke-based, 1.5px stroke. Sizes: `h-5 w-5` (20px) or `h-4 w-4` (16px) inline.
- **Color:** follows text via `currentColor`; frequently `text-emerald-600` or `text-emerald-500`.
- **Common in marketing:** `CheckCircle2`, `ArrowRight`, `Smartphone`, `ShieldCheck`, `Eye`, `Camera`, `FileText`, `ClipboardCheck`, `PenLine`, `Calculator`, `GitBranch`, `TicketPercent`.
- **Common in product:** `LayoutDashboard`, `Users`, `FileText`, `Settings`, `LogOut`, `Upload`, `CheckCircle`, `Loader2`, `X`, `File`.
- **Never use:** emoji, unicode glyph icons, or custom SVG illustrations beyond the brand mark and the LINE button glyph.

## 9) Brand Marks — Logo & Wordmark

### The mark: "Stacked Check"

A stack of three slightly-rotated receipts with a small green check tucked **inside the bottom-right corner** of the front receipt. Reads as *"many receipts in, one verified result out."* The front receipt shows real content rows (lines + a total bar) so it remains legible at favicon sizes.

### File inventory

| File | Path | Use |
|---|---|---|
| App icon (color) | `app/icon.svg` | Browser favicon — auto-wired by Next.js metadata |
| Wordmark (horizontal lockup) | `public/snapbooks.svg` | Marketing header / footer / JSON-LD `logo` |
| Mono icon (dark surfaces) | `public/brand/snapbooks-icon-mono.svg` | Use on dark backgrounds where the color mark would lose contrast |
| Apple touch icon | `public/apple-touch-icon.png` (180×180) | iOS home-screen |
| PWA icon 192 | `public/icon-192.png` | Android / PWA manifest |
| PWA icon 512 | `public/icon-512.png` | PWA splash + maskable variant |
| Open Graph card | `app/opengraph-image.png` (1200×630) | Social shares |
| Twitter card | `app/twitter-image.png` (1200×630) | X / Twitter shares |

### Wordmark anatomy

- "SnapBooks" in slate-900 + ".ai" in emerald `#10B981`, rendered as a single `<text>` run with a `<tspan>` for the accent (no chance of word-spacing drift across font fallbacks).
- Chinese subline `速博 · AI 記帳事務所` sits below in slate-500 with clear vertical breathing room.
- Uses real `<text>` elements (Geist + Noto Sans TC) — falls back to system sans + PingFang TC when the brand fonts aren't loaded.

### Usage rules

- Always preserve `SnapBooks.ai` exact casing.
- Keep clear space around the mark equal to at least the height of the receipt header strip (the dark band at the top of the front receipt).
- Do not stretch, skew, or recolor the mark.
- Do not rotate the receipt stack — the slight rotations are intentional and baked in.
- Prefer the wordmark on desktop; icon-only is acceptable in tight spaces (sidebars, mobile chrome).
- For dark surfaces, switch to `snapbooks-icon-mono.svg` rather than recoloring the color mark.

### Examples in code

```tsx
// Header / footer wordmark
<Image src="/snapbooks.svg" alt="SnapBooks.ai 速博 Logo" width={182} height={60} className="h-10 w-auto" />

// Dark sidebar mono
<img src="/brand/snapbooks-icon-mono.svg" alt="SnapBooks.ai" className="h-8 w-8" />
```

## 10) Mascot — Bookie 簿奇

A friendly owl that exists only on **casual / conversational** surfaces. Bookie does not appear inside the firm-side app shell or in any data-dense screen.

### Files

| Pose | SVG | PNG | Use |
|---|---|---|---|
| Wave (default) | `public/brand/bookie-wave.svg` | `public/brand/bookie-wave.png` | Onboarding hero, login splash, "welcome" screens |
| Thinking | `public/brand/bookie-thinking.svg` | `public/brand/bookie-thinking.png` | Loading / processing UI ("Bookie is reviewing your invoice…") |
| Sleep | `public/brand/bookie-sleep.svg` | `public/brand/bookie-sleep.png` | Empty states ("沒有發票資料 / 尚無紀錄") |

PNGs are 512×512 with transparent backgrounds — drop directly into LINE OA welcome cards, Facebook posts, etc.

### Where Bookie belongs

- Empty states in client-portal screens (upload portal, period dashboard).
- Loading or processing UI on the client-facing side.
- Onboarding / first-run / login pages.
- Marketing site illustrations next to "How it works".
- LINE OA welcome card, Facebook posts, social ads.

### Where Bookie does **not** belong

- Inside the firm-side app shell (sidebar, dashboard tiles, invoice tables) — that's calm-professional UI; Bookie is character work.
- As a UI icon — use Lucide for icons; Bookie is illustration.
- Anywhere data density is high.

### Example

```tsx
<img src="/brand/bookie-sleep.svg" alt="" className="h-32 w-32" aria-hidden />
<p className="text-base text-slate-500">這個月還沒有發票，拍張照就能開始。</p>
```

## 11) Layout Principles (Landing)

Keep structure simple and scannable:

1. Brand header + primary CTA.
2. Hero — problem framing.
3. Pain-point cards (3 key pains).
4. Feature tour with alternating image / copy rows.
5. Comparison table — "vs traditional firm".
6. Pricing — single `rounded-[2.5rem]` card.
7. FAQ accordion.
8. Final CTA block.

Single primary conversion path on landing: `/apply` form. No competing CTA (login / sign-up) on the public surface.

## 12) Social Preview Assets

- **Open Graph:** 1200 × 630 — `app/opengraph-image.png`.
- **Twitter / X:** same image reused at `app/twitter-image.png`. (Use the same source unless there's a specific reason to differ.)
- **Composition:** mark + `SnapBooks.ai` wordmark with `.ai` accent + larger `速博 · AI 記帳事務所` subline + soft mint / sky blob backdrop + `snapbooks.ai` footer.
- **Readability:** the social card must read at thumbnail size. Avoid English taglines that compete with the Chinese subline.

## 13) Visual Do / Don't

### Do

- Use subtle gradients and soft tinted surfaces (mint / slate / sky).
- Use emerald for action and slate for trust; let blue be a calmer secondary.
- Keep UI clean with enough whitespace; generous `py-24`+ between marketing sections.
- Use real product screenshots placed on phone bezels or laptop-rounded cards.
- Use Lucide icons (1.5px stroke) at consistent sizes.

### Don't

- Don't mix unrelated visual styles in the same release.
- Don't use neon-heavy or overly playful palettes.
- Don't switch brand casing.
- Don't recolor the brand mark or rotate the receipt stack.
- Don't drop emoji into product copy.
- Don't use full-bleed photography in marketing.
- Don't add inner shadows or neumorphism.
- Don't put Bookie inside the firm-side app shell.

## 14) Reusable Image-Generation Prompts

Use these as base templates and only tweak composition / text. They reflect the **emerald-led, slate-neutral** direction that matches the live site.

### A) Open Graph image

> Open Graph image for SnapBooks.ai, 1200×630, trustworthy fintech SaaS style, soft mint-to-sky gradient background (`#ECFDF5 → #F8FAFC → #E0F2FE`), prominent SnapBooks.ai wordmark with `.ai` in emerald, large Traditional Chinese subtitle `速博 · AI 記帳事務所`, stacked-receipt + corner-check mark on the left, small `snapbooks.ai` footer, calm minimal layout, no people, legible at thumbnail size.

### B) Twitter / X image

> Twitter / X share image for SnapBooks.ai, 1200×630 (matches Open Graph), same mint-to-sky gradient and same wordmark + Chinese subline, slightly tighter cropping if needed, modern and calm, minimal composition.

### C) Favicon / app icon variants

> Minimal vector icon for SnapBooks.ai, three slightly-rotated receipts in mint and emerald tones on a mint-cream backplate, small green check tucked inside the bottom-right corner of the front receipt, geometric, transparent background, centered, high contrast, optimized for sizes from 16px to 512px, no text.

## 15) Consistency Checklist (Before Publishing)

- [ ] Brand casing is `SnapBooks.ai` everywhere.
- [ ] Emerald is the primary action color; slate for neutrals.
- [ ] Display headlines use Noto Serif TC; body uses Geist.
- [ ] No `text-xs` in app-owned components.
- [ ] No emoji in product or marketing copy.
- [ ] Full-width zh-TW punctuation in zh-TW copy.
- [ ] Logo / wordmark not recoloured, stretched, or rotated.
- [ ] Bookie used only on casual surfaces (empty / loading / onboarding / social).
- [ ] Landing keeps a single primary CTA path.
- [ ] Social preview readable at thumbnail size.

## 16) Where to Find Source Assets in This Repo

| Surface | File |
|---|---|
| Tailwind config (color tokens, fonts) | `tailwind.config.ts` |
| CSS variables + landing animations | `app/globals.css` |
| Landing page (visual reference) | `app/(landing)/page.tsx` |
| Landing header / footer | `app/(landing)/layout.tsx` |
| Firm sidebar / portal sidebar | `components/firm-sidebar.tsx`, `components/portal-sidebar.tsx` |
| App icon (favicon) | `app/icon.svg` |
| Wordmark | `public/snapbooks.svg` |
| Mono icon | `public/brand/snapbooks-icon-mono.svg` |
| Mascot Bookie | `public/brand/bookie-{wave,thinking,sleep}.{svg,png}` |
| OG / Twitter | `app/opengraph-image.png`, `app/twitter-image.png` |
| PWA icons | `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`, `public/manifest.json` |

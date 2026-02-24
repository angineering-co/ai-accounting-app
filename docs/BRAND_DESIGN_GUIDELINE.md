# SnapBooks.ai Design Guideline

This document defines the visual and messaging system for SnapBooks.ai so future assets stay consistent across landing pages, social cards, and brand graphics.

## 1) Brand Core

- **Brand name:** `SnapBooks.ai` (always use this casing)
- **Category:** AI-enabled accounting workflow for one-person companies and small teams
- **Primary promise:** reduce offline paperwork friction (paper receipts, mailing, manual handoff)
- **Tone:** trustworthy, practical, calm, clear
- **Voice:** simple zh-TW, low jargon, problem-first

## 2) Design Intent

- **Perception target:** reliable finance software + modern AI efficiency
- **Visual strategy:** blue-led trust foundation, green as efficiency/success accent
- **Content strategy:** validate pain points first, then invite early-adopter signup

## 3) Color System

Use blue as primary and green as secondary accent.

### Core Colors

- **Primary Blue:** `#0EA5E9` to `#2563EB`
- **Trust Navy:** `#0F172A`
- **Accent Green:** `#10B981`
- **Soft Background Blue:** `#E0F2FE`
- **Soft Background Green:** `#DCFCE7`
- **Text Primary:** `#111827`
- **Text Secondary:** `#6B7280`
- **Card Border Neutral:** `#E5E7EB`

### Gradient Direction

- **Preferred brand gradient:** blue -> green
- **Example:** `from-sky-50 via-background to-emerald-50` for page backgrounds
- Avoid all-green primary backgrounds for main brand surfaces.

## 4) Typography & Copy Style

- **Headline style:** short, high-clarity, problem-framed
- **Body style:** 1-2 sentence blocks, concrete pain language
- **CTA copy:** action + intent clarity
  - Good: `立即加入早期試用`
  - Good: `立即填寫早期試用表單`
- Use zh-TW punctuation and wording consistently.

## 5) Layout Principles (Landing)

- Keep structure simple and scannable:
  1. brand header + primary CTA
  2. hero (problem framing)
  3. pain-point cards (3 key pains)
  4. final CTA block
- One primary conversion path on landing: Google Form only.
- No competing CTA (login/sign-up) on public landing.

## 6) Logo & Icon Usage

Current assets:

- `app/icon.svg` (app/site icon)
- `public/snapbooks-wordmark.svg` (wordmark for header/branding)

Rules:

- Keep clear space around logos (at least height of the letter `S` in `SnapBooks.ai`)
- Do not stretch, skew, or recolor logo to low-contrast colors
- Prefer full wordmark on desktop; icon-only usage is acceptable in tight spaces
- Always preserve `SnapBooks.ai` exact casing

## 7) Social Preview Assets

Current files:

- `app/opengraph-image.png`
- `app/twitter-image.png`

Guideline:

- Keep both images visually consistent (same composition/style family)
- If unsure, use the same image source for both
- Prioritize readability at small preview sizes (high contrast, short text)

Recommended sizes:

- Open Graph: `1200 x 630`
- X/Twitter: `1200 x 675` (or same as Open Graph for consistency)

## 8) Visual Do / Don’t

### Do

- Use subtle gradients and soft tinted surfaces
- Use blue as the trust anchor and green as accent
- Keep UI clean with enough whitespace
- Keep iconography simple (receipt, checkmark, workflow cues)

### Don’t

- Don’t mix unrelated visual styles in the same release
- Don’t use neon-heavy or overly playful palettes
- Don’t overload social cards with too much text
- Don’t switch brand casing (`Snapbooks`, `SNAPBOOKS`) inconsistently

## 9) Reusable Prompt Templates (for Image Generation)

Use these prompts as base templates and only tweak composition/text.

### A) Open Graph Image

`Open Graph image for SnapBooks.ai, 1200x630, trustworthy fintech SaaS style, blue-to-green gradient background, subtle grid texture, high contrast, clean minimal layout, prominent SnapBooks.ai wordmark, Traditional Chinese subtitle about accounting workflow pain relief, receipt + checkmark icon motif, no clutter, no people, legible at thumbnail size.`

### B) Twitter/X Image

`Twitter/X share image for SnapBooks.ai, 1200x675, same visual style as Open Graph, blue-led gradient with green accent, SnapBooks.ai wordmark and short Traditional Chinese pain-point tagline, simple receipt/checkmark symbol, strong contrast, modern and calm, minimal composition.`

### C) Favicon / App Icon

`Minimal vector icon for SnapBooks.ai, receipt + checkmark concept, geometric, monochrome or blue-green accent, transparent background, centered, high contrast, optimized for small sizes, no text.`

## 10) Consistency Checklist (Before Publishing)

- Brand casing is `SnapBooks.ai`
- Blue-led palette with green accent is preserved
- Landing keeps single primary CTA (Google Form)
- Social previews are style-consistent and readable
- Copy remains clear, concise, and pain-focused


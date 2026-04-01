import Link from "next/link";
import type { ReactNode } from "react";

const LINK_SPLIT = /(\[[^\]]+\]\([^)]+\))/g;
const LINK_MATCH = /^\[([^\]]+)\]\(([^)]+)\)$/;

const LINK_CLASS =
  "font-medium text-emerald-600 underline underline-offset-2 hover:text-emerald-700";

/** Parse [text](url) markdown links in a string into Link nodes */
export function renderLinkedText(text: string): string | ReactNode[] {
  const parts = text.split(LINK_SPLIT);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const match = part.match(LINK_MATCH);
    if (match) {
      return (
        <Link key={i} href={match[2]} className={LINK_CLASS}>
          {match[1]}
        </Link>
      );
    }
    return part;
  });
}

/** Parse markdown links and convert \n to <br /> */
export function renderLinkedTextWithBreaks(
  text: string | ReactNode,
): ReactNode {
  if (typeof text !== "string") return text;
  return text.split("\n").map((line, li, lines) => (
    <span key={li}>
      {renderLinkedText(line)}
      {li < lines.length - 1 && <br />}
    </span>
  ));
}

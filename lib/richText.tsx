import React from "react";
import Link from "next/link";

export function renderInlineRich(
  text: string,
  opts?: { linkClassName?: string }
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re =
    /(\*\*(.+?)\*\*)|(\[(.+?)\]\(((?:https?:\/\/|\/)[^)\s]+)\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const start = match.index;

    if (start > lastIndex) {
      nodes.push(
        <span key={`t-${lastIndex}`}>{text.slice(lastIndex, start)}</span>
      );
    }

    // **bold**
    if (match[1]) {
      nodes.push(<strong key={`b-${start}`}>{match[2] ?? ""}</strong>);
    }
    // [label](url)
    else if (match[3]) {
      const label = match[4] ?? "";
      const url = match[5] ?? ""; // ✅ full URL now

      const isExternal = url.startsWith("http");

      nodes.push(
        isExternal ? (
          <a
            key={`a-${start}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={opts?.linkClassName}
          >
            {label}
          </a>
        ) : (
          <Link
            key={`a-${start}`}
            href={url}
            className={opts?.linkClassName}
          >
            {label}
          </Link>
        )
      );
    }

    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(
      <span key={`t-${lastIndex}-end`}>{text.slice(lastIndex)}</span>
    );
  }

  return nodes;
}

export type Block =
  | { type: "h2"; text: string }
  | { type: "image"; index: number }
  | { type: "p"; lines: string[] };

export function parseFullText(fullText: string): Block[] {
  const lines = fullText.replace(/\r\n/g, "\n").split("\n");

  const blocks: Block[] = [];
  let paragraphBuf: string[] = [];

  const flushParagraph = () => {
    const cleaned = paragraphBuf.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length) blocks.push({ type: "p", lines: cleaned });
    paragraphBuf = [];
  };

  const headerRe = /^\s*##\s*(.+?)\s*##\s*$/;
  const imageRe = /^\s*##\s*Image\s+(\d+)\s*##\s*$/i;

  for (const raw of lines) {
    const line = raw.trimEnd(); // keep intentional spacing at line start if you ever want it later

    // Blank line -> paragraph break
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    // Image placeholder
    const im = line.trim().match(imageRe);
    if (im) {
      flushParagraph();
      blocks.push({ type: "image", index: Number(im[1]) });
      continue;
    }

    // Header line
    const hm = line.trim().match(headerRe);
    if (hm) {
      flushParagraph();
      blocks.push({ type: "h2", text: hm[1].trim() });
      continue;
    }

    // Otherwise accumulate raw line (preserve newline boundary)
    paragraphBuf.push(line);
  }

  flushParagraph();
  return blocks;
}

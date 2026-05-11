"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "@/styles/designTrip.module.css";

// ── ProseMarkdown ──────────────────────────────────────────────────────────────
// For Full Description and Want More.
// Supports: paragraphs, > "quote" → pull-quote callout, [text](url) affiliate links.

export function ProseMarkdown({ content }: { content: string }) {
  return (
    <div className={styles.prose}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          blockquote({ children }) {
            return <div className={styles.pullQuote}>{children}</div>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.proseLink}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ── LodgingMarkdown ────────────────────────────────────────────────────────────
// For Lodging and Dining sections. Affiliate links supported in description text.
// Format:
//   ### Property Name
//   **Tag line or use case**
//   Description text. Can include [affiliate links](url).

type LodgingEntry = { name: string; tag: string; text: string };

function parseLodging(markdown: string): LodgingEntry[] {
  return markdown
    .split(/^(?=### )/m)
    .filter(Boolean)
    .map((block) => {
      const lines = block.trim().split("\n").filter(Boolean);
      const name = lines[0].replace(/^### /, "");
      const tagMatch = lines[1]?.match(/^\*\*(.+)\*\*$/);
      const tag = tagMatch ? tagMatch[1] : "";
      const textLines = tagMatch ? lines.slice(2) : lines.slice(1);
      return { name, tag, text: textLines.join("\n") };
    });
}

function InlineMarkdown({ text, className }: { text: string; className: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p({ children }) {
            return <>{children}</>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.stayLink}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function LodgingMarkdown({ content, label }: { content: string; label: string }) {
  const entries = parseLodging(content);
  return (
    <>
      <div className={styles.staySubhead}>{label}</div>
      <div className={styles.stayList}>
        {entries.map((entry) => (
          <div key={entry.name} className={styles.stayCard}>
            <div className={styles.stayCardHead}>
              <div className={styles.stayCardName}>{entry.name}</div>
              {entry.tag && <div className={styles.stayCardTag}>{entry.tag}</div>}
            </div>
            <InlineMarkdown text={entry.text} className={styles.stayCardText} />
          </div>
        ))}
      </div>
    </>
  );
}

// ── PackMarkdown ───────────────────────────────────────────────────────────────
// For Pack Bring and Pack Leave. One item per line. Affiliate links supported.
// Format (simple):   Waterproof jacket
// Format (labeled):  Waterproof jacket: bring two, they soak through fast

function PackItem({
  text,
  variant,
}: {
  text: string;
  variant: "bring" | "leave";
}) {
  const itemClass =
    variant === "leave"
      ? `${styles.packItem} ${styles.packItemLeave}`
      : styles.packItem;
  const iconClass =
    variant === "leave" ? styles.packLeaveCheck : styles.packCheck;

  // Split "Label: description" into stacked head + body lines
  const colonIdx = text.indexOf(": ");
  const head = colonIdx > -1 ? text.slice(0, colonIdx) : text;
  const body = colonIdx > -1 ? text.slice(colonIdx + 2) : null;

  return (
    <div className={itemClass}>
      <span className={iconClass} aria-hidden="true">
        {variant === "leave" && "✕"}
      </span>
      <div>
        <div className={styles.packItemHead}>{head}</div>
        {body && (
          <div className={styles.packItemBody}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p({ children }) {
                  return <span>{children}</span>;
                },
                a({ href, children }) {
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.packLink}
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {body}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

export function PackMarkdown({
  content,
  variant,
}: {
  content: string;
  variant: "bring" | "leave";
}) {
  const items = content.split("\n").filter(Boolean);
  return (
    <>
      {items.map((item, i) => (
        <PackItem key={i} text={item} variant={variant} />
      ))}
    </>
  );
}

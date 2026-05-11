"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ContextType } from "@/lib/universalEngine";

type WidgetMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  followUpOptions?: string[];
  created_at: string;
  pending?: boolean;
  failed?: boolean;
};

function makeTempId() {
  return `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const LS_KEY = "gti_caddie_widget_v2";

function loadHistory(): WidgetMsg[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(msgs: WidgetMsg[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(msgs.slice(-50)));
  } catch {
    // ignore
  }
}

function getSeed(contextType?: ContextType): { content: string; followUpOptions: string[] } {
  if (contextType === "trip") {
    return {
      content: "Hi there, I'm the GTI Caddie. If you have any questions about the trip (courses, lodging, or planning), I'm here to help.",
      followUpOptions: [
        "Which courses are must play?",
        "What other courses are nearby?",
        "What's the best time of year to visit?",
        "Which airports are the closest?",
      ],
    };
  }
  if (contextType === "journey") {
    return {
      content: "Hi there, I'm the GTI Caddie. If you have any questions about the journey (courses, lodging, or planning), I'm here to help.",
      followUpOptions: [
        "How many days do we need?",
        "How much driving is required?",
        "What's the best time of year to visit?",
        "How many top 100 courses are included?",
      ],
    };
  }
  return {
    content: "Hi there, I'm the GTI Caddie, here to help you find and plan the golf trip of a lifetime.",
    followUpOptions: [
      "Which trips have the most top 100 courses?",
      "What are the best winter trips?",
      "What are the best weekend trips?",
      "Help me decide between two trips.",
    ],
  };
}

export default function CaddieWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<WidgetMsg[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);
  const [compareBarHeight, setCompareBarHeight] = useState(0);
  const [windowWidth, setWindowWidth] = useState(1200);

  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const update = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-caddie", handler);
    return () => window.removeEventListener("open-caddie", handler);
  }, []);

  useEffect(() => {
    let ro: ResizeObserver | null = null;

    function attach(el: Element) {
      ro?.disconnect();
      ro = new ResizeObserver(() => setCompareBarHeight((el as HTMLElement).offsetHeight));
      ro.observe(el);
      setCompareBarHeight((el as HTMLElement).offsetHeight);
    }

    function check() {
      const el = document.querySelector("[data-compare-bar]");
      if (el) {
        attach(el);
      } else {
        ro?.disconnect();
        ro = null;
        setCompareBarHeight(0);
      }
    }

    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    check();
    return () => { mo.disconnect(); ro?.disconnect(); };
  }, []);

  // Detect trip or journey context from current URL
  const contextInfo = useMemo<{ contextSlug?: string; contextType?: ContextType }>(() => {
    const tripMatch = (pathname ?? "").match(/^\/trips\/([^/]+)/);
    if (tripMatch) return { contextSlug: tripMatch[1], contextType: "trip" };

    const journeyMatch = (pathname ?? "").match(/^\/journeys\/([^/]+)/);
    if (journeyMatch) return { contextSlug: journeyMatch[1], contextType: "journey" };

    return {};
  }, [pathname]);

  // Load persisted history once on mount
  useEffect(() => {
    const h = loadHistory();
    if (h.length) {
      setMessages(h);
    } else {
      const seed = getSeed(contextInfo.contextType);
      setMessages([{
        id: "seed",
        role: "assistant",
        content: seed.content,
        followUpOptions: seed.followUpOptions,
        created_at: new Date().toISOString(),
      }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on change
  useEffect(() => {
    if (!messages.length) return;
    saveHistory(messages);
  }, [messages]);

  // Scroll to bottom when open and messages change
  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [open, messages]);

  const recentForApi = useMemo(
    () =>
      messages
        .filter((m) => !m.pending && !m.failed)
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content })),
    [messages]
  );

  async function send(contentOverride?: string) {
    const content = (contentOverride ?? draft).trim();
    if (!content || inFlightRef.current) return;

    inFlightRef.current = true;

    const tempId = makeTempId();
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content, created_at: new Date().toISOString(), pending: true },
    ]);
    setDraft("");
    setSending(true);

    try {
      const res = await fetch("/api/caddie/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          messages: recentForApi,
          contextSlug: contextInfo.contextSlug,
          contextType: contextInfo.contextType,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Chat failed");

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false } : m))
      );

      if (json?.assistantMessage?.content) {
        setMessages((prev) => [
          ...prev,
          {
            id: json.assistantMessage.id ?? makeTempId(),
            role: "assistant",
            content: String(json.assistantMessage.content),
            followUpOptions: Array.isArray(json.assistantMessage.followUpOptions)
              ? json.assistantMessage.followUpOptions
              : [],
            created_at: json.assistantMessage.created_at ?? new Date().toISOString(),
          },
        ]);
      }
    } catch (e: any) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m))
      );
      setMessages((prev) => [
        ...prev,
        {
          id: makeTempId(),
          role: "assistant",
          content: `Error: ${e?.message ?? "Unknown error"}`,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
      inFlightRef.current = false;
    }
  }

  function clear() {
    const s = getSeed(contextInfo.contextType);
    const seed: WidgetMsg[] = [{
      id: "seed",
      role: "assistant",
      content: s.content,
      followUpOptions: s.followUpOptions,
      created_at: new Date().toISOString(),
    }];
    setMessages(seed);
    saveHistory(seed);
  }

  return (
    <>
      {/* Floating launcher — hidden on mobile/tablet, shown on desktop */}
      {windowWidth >= 1024 && (
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            position: "fixed",
            right: 18,
            bottom: 18 + compareBarHeight,
            zIndex: 9999,
            borderRadius: 999,
            border: "1px solid #ddd",
            background: "white",
            padding: "8px 17px 8px 12px",
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
          aria-label="Open GTI Caddie"
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8, overflow: "visible" }}>
            <img src="/gti-avatar-thumb.png" alt="" aria-hidden="true" style={{
              width: 36, height: 36, borderRadius: "50%",
              flexShrink: 0, marginLeft: -4, marginTop: -4, marginBottom: -4,
            }} />
            GTI Caddie
          </span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          style={windowWidth < 640 ? {
            position: "fixed",
            inset: 0,
            width: "100%",
            height: "100%",
            zIndex: 9999,
            background: "white",
            border: "none",
            borderRadius: 0,
            overflow: "hidden",
            boxShadow: "none",
            display: "flex",
            flexDirection: "column",
          } : {
            position: "fixed",
            right: 18,
            bottom: 72 + compareBarHeight,
            width: 360,
            maxWidth: "calc(100vw - 36px)",
            height: 520,
            maxHeight: "calc(100vh - 120px)",
            zIndex: 9999,
            background: "white",
            border: "1px solid #e6e6e6",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 18px 48px rgba(0,0,0,0.16)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 12px",
              borderBottom: "1px solid #eee",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src="/gti-avatar-thumb.png" alt="" aria-hidden="true" style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
              }} />
              <span style={{ fontWeight: 800 }}>GTI Caddie</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={clear}
                style={{
                  border: "1px solid #ddd",
                  background: "white",
                  borderRadius: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  border: "1px solid #ddd",
                  background: "white",
                  borderRadius: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                Close
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 12,
              background: "#fafafa",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "88%",
                  }}
                >
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: "1px solid #e8e8e8",
                      background: "white",
                      opacity: m.pending ? 0.65 : 1,
                    }}
                  >
                    <div style={{ fontSize: 11, color: "#777", marginBottom: 4 }}>
                      {m.role === "user" ? "You" : "GTI Caddie"}
                      {m.pending ? " · sending…" : ""}
                      {m.failed ? " · failed" : ""}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.55 }}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p style={{ margin: "0 0 6px" }}>{children}</p>,
                          ul: ({ children }) => <ul style={{ margin: "4px 0 6px", paddingLeft: 18 }}>{children}</ul>,
                          ol: ({ children }) => <ol style={{ margin: "4px 0 6px", paddingLeft: 18 }}>{children}</ol>,
                          li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
                          strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
                          h1: ({ children }) => <p style={{ fontWeight: 700, margin: "0 0 4px" }}>{children}</p>,
                          h2: ({ children }) => <p style={{ fontWeight: 700, margin: "0 0 4px" }}>{children}</p>,
                          h3: ({ children }) => <p style={{ fontWeight: 700, margin: "0 0 4px" }}>{children}</p>,
                          a: ({ href, children }) => <a href={href} style={{ color: "#1a6fc4", textDecoration: "underline" }}>{children}</a>,
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {/* Follow-up chips */}
                  {m.role === "assistant" &&
                    m.followUpOptions &&
                    m.followUpOptions.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          marginTop: 6,
                        }}
                      >
                        {m.followUpOptions.map((opt, i) => (
                          <button
                            key={i}
                            onClick={() => void send(opt)}
                            disabled={sending}
                            style={{
                              border: "1px solid #ddd",
                              background: "white",
                              borderRadius: 20,
                              padding: "5px 10px",
                              fontSize: 12,
                              cursor: sending ? "not-allowed" : "pointer",
                              color: "#333",
                              textAlign: "left",
                            }}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              ))}

              {sending && (
                <div style={{ fontSize: 12, color: "#666", alignSelf: "flex-start" }}>
                  GTI Caddie is thinking…
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Composer */}
          <div style={{ padding: 12, borderTop: "1px solid #eee" }}>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask about trips, courses, logistics…"
                disabled={sending}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: "white",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                onClick={() => void send()}
                disabled={sending || !draft.trim()}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: "white",
                  cursor: sending ? "not-allowed" : "pointer",
                  fontWeight: 800,
                  minWidth: 78,
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

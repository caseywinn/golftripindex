"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type WidgetMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  pending?: boolean;
  failed?: boolean;
};

function makeTempId() {
  return `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const LS_KEY = "gti_caddie_widget_v1";

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

export default function CaddieWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [assistantPending, setAssistantPending] = useState(false);
  const [messages, setMessages] = useState<WidgetMsg[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);

  // Load persisted local history once
  useEffect(() => {
    const h = loadHistory();
    setMessages(h.length ? h : [{
      id: "seed",
      role: "assistant",
      content:
        "I’m Caddie. Tell me your group size, days, flying/driving, and the vibe you want (pure golf, resort, hidden gems, architecture).",
      created_at: new Date().toISOString(),
    }]);
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

  const recentForApi = useMemo(() => {
    // API expects: { role, content } with limited history
    return messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
  }, [messages]);

  async function send(contentOverride?: string) {
    const content = (contentOverride ?? draft).trim();
    if (!content) return;
    if (inFlightRef.current) return;

    inFlightRef.current = true;

    // Optimistic append
    const tempId = makeTempId();
    const optimistic: WidgetMsg = {
      id: tempId,
      role: "user",
      content,
      created_at: new Date().toISOString(),
      pending: true,
    };

    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    setSending(true);
    setAssistantPending(true);

    try {
      const res = await fetch("/api/caddie/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, messages: recentForApi }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Chat failed");

      // Mark user msg complete
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false } : m))
      );

      if (json?.assistantMessage?.content) {
        const asst: WidgetMsg = {
          id: json.assistantMessage.id ?? makeTempId(),
          role: "assistant",
          content: String(json.assistantMessage.content),
          created_at: json.assistantMessage.created_at ?? new Date().toISOString(),
        };
        setMessages((prev) => [...prev, asst]);
      }
    } catch (e: any) {
      const msg = e?.message ?? "Unknown error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, pending: false, failed: true } : m
        )
      );
      setMessages((prev) => [
        ...prev,
        {
          id: makeTempId(),
          role: "assistant",
          content: `Error: ${msg}`,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
      setAssistantPending(false);
      inFlightRef.current = false;
    }
  }

  function clear() {
    const seed: WidgetMsg[] = [{
      id: "seed",
      role: "assistant",
      content:
        "Fresh start. Where are you coming from, how many golfers, and how many days?",
      created_at: new Date().toISOString(),
    }];
    setMessages(seed);
    saveHistory(seed);
  }

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 9999,
          borderRadius: 999,
          border: "1px solid #ddd",
          background: "white",
          padding: "12px 14px",
          fontWeight: 800,
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        }}
        aria-label="Open Caddie"
      >
        Caddie
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            right: 18,
            bottom: 72,
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
            <div style={{ fontWeight: 800 }}>GTI Caddie</div>

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
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid #e8e8e8",
                    background: m.role === "user" ? "white" : "#fff",
                    opacity: m.pending ? 0.65 : 1,
                  }}
                >
                  <div style={{ fontSize: 11, color: "#777", marginBottom: 4 }}>
                    {m.role}
                    {m.pending ? " • sending…" : ""}
                    {m.failed ? " • failed" : ""}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                </div>
              ))}
              {assistantPending && (
                <div style={{ fontSize: 12, color: "#666" }}>Caddie is thinking…</div>
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

            <div style={{ marginTop: 8, fontSize: 11, color: "#777" }}>
              Tip: “8 guys, 3 days, flying from LAX, want non-traditional + great architecture.”
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/styles/journey.module.css";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  followUpOptions?: string[];
  pending?: boolean;
  failed?: boolean;
};

function tempId() {
  return `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function JourneyChatPanel({
  journeySlug,
  journeyName,
}: {
  journeySlug: string;
  journeyName: string;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "seed",
      role: "assistant",
      content: `I'm your planning assistant for the ${journeyName} journey. Tell me your group size, how many days you have, and your budget — and I'll help you build the right itinerary.`,
      followUpOptions: [
        "Which courses are must-plays?",
        "Where should we stay?",
        "How many days do we need?",
      ],
    },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [open, messages]);

  const recentForApi = messages
    .filter((m) => !m.pending && !m.failed)
    .slice(-14)
    .map((m) => ({ role: m.role, content: m.content }));

  async function send(contentOverride?: string) {
    const content = (contentOverride ?? draft).trim();
    if (!content || inFlight.current) return;

    inFlight.current = true;
    const tid = tempId();

    setMessages((prev) => [
      ...prev,
      { id: tid, role: "user", content, pending: true },
    ]);
    setDraft("");
    setSending(true);

    try {
      const res = await fetch("/api/journey/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: journeySlug, content, messages: recentForApi }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Request failed");

      setMessages((prev) =>
        prev.map((m) => (m.id === tid ? { ...m, pending: false } : m))
      );

      if (json?.assistantMessage?.content) {
        setMessages((prev) => [
          ...prev,
          {
            id: json.assistantMessage.id ?? tempId(),
            role: "assistant",
            content: json.assistantMessage.content,
            followUpOptions: json.assistantMessage.followUpOptions ?? [],
          },
        ]);
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === tid ? { ...m, pending: false, failed: true } : m))
      );
      setMessages((prev) => [
        ...prev,
        {
          id: tempId(),
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setSending(false);
      inFlight.current = false;
    }
  }

  return (
    <>
      <button
        className={styles.journeyLauncher}
        onClick={() => setOpen((v) => !v)}
        aria-label="Open Journey Assistant"
      >
        Journey Caddie
      </button>

      {open && (
        <div className={styles.journeyPopup}>
          <div className={styles.chatHeader}>
            <span className={styles.chatTitle}>Journey Assistant</span>
            <button
              className={styles.chatHeaderClose}
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>

          <div className={styles.chatMessages}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === "user"
                    ? styles.chatBubbleUser
                    : styles.chatBubbleAssistant
                }
              >
                <div className={styles.chatBubbleRole}>
                  {m.role === "user" ? "You" : "Assistant"}
                  {m.pending ? " · sending…" : ""}
                  {m.failed ? " · failed" : ""}
                </div>
                <div className={styles.chatBubbleContent}>{m.content}</div>

                {m.role === "assistant" &&
                  m.followUpOptions &&
                  m.followUpOptions.length > 0 && (
                    <div className={styles.chatOptions}>
                      {m.followUpOptions.map((opt, i) => (
                        <button
                          key={i}
                          className={styles.chatOption}
                          onClick={() => void send(opt)}
                          disabled={sending}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            ))}

            {sending && (
              <div className={styles.chatThinking}>Assistant is thinking…</div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className={styles.chatComposer}>
            <input
              className={styles.chatInput}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about courses, hotels, driving, budget…"
              disabled={sending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              className={styles.chatSend}
              onClick={() => void send()}
              disabled={sending || !draft.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}

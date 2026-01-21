"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Room = {
  id: string;
  join_code: string;
  slug?: string | null;
  created_at: string;
};

type Chat = {
  id: string;
  room_id: string;
  content: string;
  kind?: string; // "user" | "assistant" | etc
  created_at: string;
  payload?: any;

  // client-only flags (safe: TS allows extra fields even if DB doesn't)
  pending?: boolean;
  failed?: boolean;
};

type Option = {
  id: string;
  label: string;
};

type AssistantPayload =
  | {
      kind: "question";
      step?: string;
      allowFreeText?: boolean; // legacy; UI no longer enforces
      options?: Option[];
    }
  | {
      kind: "info";
      step?: string;
    }
  | {
      kind: string;
      step?: string;
      [k: string]: any;
    };

function isAssistantPayload(p: any): p is AssistantPayload {
  return !!p && typeof p === "object" && typeof p.kind === "string";
}

function makeTempId() {
  return `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = useMemo(
    () => (params?.code || "").toString().toUpperCase(),
    [params]
  );

  const [room, setRoom] = useState<Room | null>(null);
  const [chat, setChat] = useState<Chat[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [assistantPending, setAssistantPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tripState, setTripState] = useState<any>({});
  const [stateUpdatedAt, setStateUpdatedAt] = useState<string | null>(null);

  // Prevent overlapping assistant requests if user spams Send
  const assistantInFlightRef = useRef(false);
  const bootstrappedRef = useRef(false);

  // ---- Derived “suggested UI” state from the most recent assistant message ----
  const lastAssistantMessage = useMemo(() => {
    for (let i = chat.length - 1; i >= 0; i--) {
      if (chat[i]?.kind === "assistant") return chat[i];
    }
    return null;
  }, [chat]);

  const assistantPayload = useMemo<AssistantPayload | null>(() => {
    const p = lastAssistantMessage?.payload;
    if (!isAssistantPayload(p)) return null;
    return p;
  }, [lastAssistantMessage]);

  // Suggestions come from question payload options, but are NEVER gating.
  const suggestions: Option[] = useMemo(() => {
    if (!assistantPayload) return [];
    if (assistantPayload.kind !== "question") return [];
    return Array.isArray(assistantPayload.options) ? assistantPayload.options : [];
  }, [assistantPayload]);

  // Free-form chat: always allow text input.
  const allowFreeText = true;

  async function load() {
    setLoading(true);
    setError(null);

    try {
      // room
      const roomRes = await fetch(`/api/rooms/join/${code}`, { cache: "no-store" });
      const roomJson = await roomRes.json().catch(() => ({}));
      if (!roomRes.ok) throw new Error(roomJson?.error || "Failed to load room");
      setRoom(roomJson.room);

      // messages
      const msgRes = await fetch(`/api/rooms/join/${code}/messages`, {
        cache: "no-store",
      });
      const msgJson = await msgRes.json().catch(() => ({}));
      if (!msgRes.ok) throw new Error(msgJson?.error || "Failed to load messages");
      const msgs = Array.isArray(msgJson.messages) ? msgJson.messages : [];
      setChat(msgs);

      // If no messages exist, bootstrap the greeting/options once.
      void bootstrapAssistantIfEmpty(msgs);

      // state (Step 9.2)
      const stateRes = await fetch(`/api/rooms/join/${code}/state`, {
        cache: "no-store",
      });
      const stateJson = await stateRes.json().catch(() => ({}));
      if (!stateRes.ok) throw new Error(stateJson?.error || "Failed to load state");
      setTripState(stateJson.state || {});
      setStateUpdatedAt(stateJson.updated_at ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function bootstrapAssistantIfEmpty(currentChat?: Chat[]) {
    if (bootstrappedRef.current) return;

    const chatToCheck = currentChat ?? chat;
    if (chatToCheck.length > 0) return;

    bootstrappedRef.current = true;
    setAssistantPending(true);

    try {
      const res = await fetch(`/api/rooms/join/${code}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persist: true }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Assistant bootstrap failed");

      // Your assistant route currently returns { payload } but also persists a message.
      // Reload messages to pick it up.
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setAssistantPending(false);
    }
  }

  async function sendChat(contentOverride?: string) {
    const content = (contentOverride ?? draft).trim();
    if (!content) return;

    // Still prevent overlap (you can relax this later if you want true queueing)
    if (assistantInFlightRef.current) return;
    assistantInFlightRef.current = true;

    // --------- OPTIMISTIC UI: append immediately + clear input ----------
    const tempId = makeTempId();
    const nowIso = new Date().toISOString();

    const optimisticUserMessage: Chat = {
      id: tempId,
      room_id: room?.id ?? "",
      content,
      kind: "user",
      created_at: nowIso,
      pending: true,
    };

    setChat((prev) => [...prev, optimisticUserMessage]);
    setDraft(""); // key: clear entry box immediately
    // -------------------------------------------------------------------

    setSending(true);
    setAssistantPending(true);
    setError(null);

    try {
      const res = await fetch(`/api/rooms/join/${code}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          meta: {
            source: contentOverride ? "suggestion" : "free_text",
            step: assistantPayload?.step,
          },
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Chat failed");

      // Expect: { userMessage, assistantMessage, state }

      // Replace optimistic user message with persisted one (best), otherwise just mark not pending
      if (json?.userMessage) {
        setChat((prev) => {
          const next = prev.map((m) =>
            m.id === tempId ? { ...json.userMessage } : m
          );
          return next;
        });
      } else {
        setChat((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, pending: false } : m))
        );
      }

      if (json?.assistantMessage) {
        setChat((prev) => [...prev, json.assistantMessage]);
      }

      if (json?.state) {
        setTripState(json.state);
        setStateUpdatedAt(json.updated_at ?? null);
      } else {
        // fallback: refresh state
        const stateRes = await fetch(`/api/rooms/join/${code}/state`, { cache: "no-store" });
        const stateJson = await stateRes.json().catch(() => ({}));
        if (stateRes.ok) {
          setTripState(stateJson.state || {});
          setStateUpdatedAt(stateJson.updated_at ?? null);
        }
      }
    } catch (e: any) {
      const msg = e?.message ?? "Unknown error";
      setError(msg);

      // Mark optimistic message as failed
      setChat((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, pending: false, failed: true } : m
        )
      );

      // Optional: also append an assistant error bubble so the thread explains itself
      setChat((prev) => [
        ...prev,
        {
          id: makeTempId(),
          room_id: room?.id ?? "",
          content: `Error: ${msg}`,
          kind: "assistant",
          created_at: new Date().toISOString(),
          payload: { kind: "info", step: "error" },
        },
      ]);
    } finally {
      setSending(false);
      setAssistantPending(false);
      assistantInFlightRef.current = false;
    }
  }

  function onSuggestionClick(opt: Option) {
    // Send label as content (human-readable).
    void sendChat(opt.label);
  }

  useEffect(() => {
    if (!code) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          onClick={() => router.push("/caddie")}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "white",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Back
        </button>

        <h1 style={{ fontSize: 22, fontWeight: 700 }}>
          Room: <span style={{ fontFamily: "monospace" }}>{code}</span>
        </h1>
      </div>

      {loading && <p style={{ marginTop: 16 }}>Loading...</p>}

      {error && (
        <p style={{ marginTop: 16, color: "crimson", fontWeight: 600 }}>
          {error}
        </p>
      )}

      {room && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <div style={{ fontSize: 13, color: "#666" }}>Room ID</div>
          <div style={{ fontFamily: "monospace" }}>{room.id}</div>

          {/* Optional: show state timestamp for debugging */}
          {stateUpdatedAt && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#777" }}>
              State updated: {new Date(stateUpdatedAt).toLocaleString()}
            </div>
          )}
        </div>
      )}

      <section style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Chat</h2>
          {assistantPending && (
            <span style={{ fontSize: 12, color: "#666" }}>
              Assistant is thinking…
            </span>
          )}
          {!allowFreeText && (
            <span style={{ fontSize: 12, color: "#666" }}>
              {/* retained only for type completeness; allowFreeText is always true */}
            </span>
          )}
        </div>

        <div
          style={{
            marginTop: 10,
            border: "1px solid #eee",
            borderRadius: 12,
            padding: 12,
            minHeight: 240,
            background: "white",
          }}
        >
          {chat.length === 0 ? (
            <p style={{ color: "#777" }}>No chat yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {chat.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: 10,
                    border: "1px solid #eee",
                    borderRadius: 10,
                    background: "#fcfcfc",
                    opacity: c.pending ? 0.7 : 1,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {new Date(c.created_at).toLocaleString()}{" "}
                    {c.kind ? `• ${c.kind}` : ""}
                    {c.pending ? " • sending…" : ""}
                    {c.failed ? " • failed" : ""}
                  </div>
                  <div style={{ marginTop: 6 }}>{c.content}</div>

                  {c.kind === "assistant" && c.payload?.kind && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#999" }}>
                      payload: {String(c.payload.kind)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Suggestions (rendered from the last assistant message payload) */}
        {suggestions.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
              Suggestions
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {suggestions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => onSuggestionClick(opt)}
                  disabled={sending || assistantPending}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 999,
                    border: "1px solid #ddd",
                    background: "white",
                    cursor:
                      sending || assistantPending ? "not-allowed" : "pointer",
                    fontWeight: 700,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message… (or tap a suggestion)"
            disabled={sending || assistantPending}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "white",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendChat();
              }
            }}
          />

          <button
            onClick={() => void sendChat()}
            disabled={sending || assistantPending}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "white",
              cursor: sending || assistantPending ? "not-allowed" : "pointer",
              fontWeight: 700,
              minWidth: 110,
            }}
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </section>
    </main>
  );
}

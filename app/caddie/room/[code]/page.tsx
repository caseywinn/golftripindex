"use client";

import { useEffect, useMemo, useState } from "react";
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
  kind?: string;
  created_at: string;
  payload?: any;
};

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = useMemo(() => (params?.code || "").toString().toUpperCase(), [params]);

  const [room, setRoom] = useState<Room | null>(null);
  const [chat, setChat] = useState<Chat[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      // room
      const roomRes = await fetch(`/api/rooms/join/${code}`);
      const roomJson = await roomRes.json().catch(() => ({}));
      if (!roomRes.ok) throw new Error(roomJson?.error || "Failed to load room");
      setRoom(roomJson.room);

      // messages
    const chatRes = await fetch(`/api/rooms/join/${code}/messages`);
    const chatJson = await chatRes.json().catch(() => ({}));
    if (!chatRes.ok) throw new Error(chatJson?.error || "Failed to load messages");
    setChat(chatJson.messages || []);

    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function sendChat() {
    const content = draft.trim();
    if (!content) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/rooms/join/${code}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to send chat");

      setChat((prev) => [...prev, json.userMessage, json.assistantMessage]);
        setDraft("");
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (!code) return;
    load();
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
        <p style={{ marginTop: 16, color: "crimson", fontWeight: 600 }}>{error}</p>
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
        </div>
      )}

      <section style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Chat</h2>

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
                  }}
                >
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {new Date(c.created_at).toLocaleString()} {c.kind ? `• ${c.kind}` : ""}
                  </div>
                  <div style={{ marginTop: 6 }}>{c.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message..."
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendChat();
            }}
          />

          <button
            onClick={sendChat}
            disabled={sending}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "white",
              cursor: sending ? "not-allowed" : "pointer",
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CaddieHomePage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createRoom() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to create room");
      }

      const code = data?.room?.join_code;
      if (!code) throw new Error("Missing join_code from API response");

      router.push(`/caddie/room/${code}`);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function joinRoom() {
    setError(null);

    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError("Enter a join code");
      return;
    }

    router.push(`/caddie/room/${code}`);
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>GTI Caddie</h1>
      <p style={{ marginTop: 8, color: "#555" }}>
        Create a room for trip planning, or join an existing one.
      </p>

      <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <button
          onClick={createRoom}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            cursor: loading ? "not-allowed" : "pointer",
            background: "white",
            fontWeight: 600,
          }}
        >
          {loading ? "Creating..." : "Create room"}
        </button>
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Enter join code (e.g. 0HIMIY)"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              width: 280,
            }}
          />
          <button
            onClick={joinRoom}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              cursor: "pointer",
              background: "white",
              fontWeight: 600,
            }}
          >
            Join
          </button>
        </div>
      </div>

      {error && (
        <p style={{ marginTop: 16, color: "crimson", fontWeight: 600 }}>
          {error}
        </p>
      )}
    </main>
  );
}

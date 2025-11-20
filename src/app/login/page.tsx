"use client";
import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setMessage(String(data?.error || "เข้าสู่ระบบไม่สำเร็จ"));
        return;
      }
      // Redirect to homepage (or to `next` if provided)
      const url = new URL(window.location.href);
      const next = url.searchParams.get("next") || "/";
      window.location.href = next;
    } catch (err: any) {
      setMessage(err?.message || "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={onSubmit} style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 16 }}>
        <h2 style={{ margin: 0, marginBottom: 16, fontSize: 18, color: "#222" }}>เข้าสู่ระบบ</h2>
        <label style={{ display: "block", fontSize: 13, lineHeight: 1.4, color: "#333", marginBottom: 4 }}>
          บัญชีผู้ใช้งาน
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    height: 46,
                    padding: "12px 14px",
                    fontSize: 15,
                    marginTop: 6,
                    borderRadius: 12,
                    border: "1px solid #dcdcdc",
                    outline: "none",
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.03)",
                  }}
                />
              </label>
              <label style={{ display: "block", fontSize: 13, lineHeight: 1.4, color: "#333", marginBottom: 4 }}>
                รหัสผ่าน
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    height: 46,
                    padding: "12px 14px",
                    fontSize: 15,
                    marginTop: 6,
                    borderRadius: 12,
                    border: "1px solid #dcdcdc",
                    outline: "none",
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.03)",
                  }}
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  height: 46,
                  padding: "0 16px",
                  fontSize: 15,
                  borderRadius: 12,
                  border: "1px solid #1f6fd6",
                  background: loading ? "#7fb0f5" : "#2d7ff9",
                  color: "#fff",
                  cursor: loading ? "default" : "pointer",
                  transition: "background 0.2s ease, transform 0.05s ease",
                }}
                onMouseDown={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.99)";
                }}
                onMouseUp={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                }}
              >
                {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
              </button>
              {message && <div style={{ color: "#c00", fontSize: 13 }}>{message}</div>}
      </form>
    </div>
  );
}
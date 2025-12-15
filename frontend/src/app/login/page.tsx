"use client";
import { useEffect, useState } from "react";

export default function LoginPage({ searchParams }: { searchParams?: Record<string, string> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const next = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("next") || "/"
    : searchParams?.next || "/";

  useEffect(() => {
    setError(null);
  }, [username, password]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        window.location.href = next || "/";
      } else {
        setError(data?.error || "เข้าสู่ระบบไม่สำเร็จ");
      }
    } catch (err: any) {
      setError(err?.message || "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAFB" }}>
      <div style={{ width: 420, padding: 28, borderRadius: 16, background: "#fff", boxShadow: "0 12px 24px rgba(16,24,40,0.06)", border: "1px solid #EEF2F7" }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
         
          <div style={{ fontSize: 22, fontWeight: 700 }}>เข้าสู่ระบบ</div>
        </div>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 16, width: "100%", maxWidth: 360, margin: "0 auto" }}>
          <div>
            <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: "#667085" }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoFocus
              style={{ width: "100%", padding: "12px 40px 12px 12px", border: "1px solid #D0D5DD", borderRadius: 10, outline: "none", boxShadow: "0 1px 2px rgba(16,24,40,0.04)", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: "#667085" }}>Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                style={{ width: "100%", padding: "12px 40px 12px 12px", border: "1px solid #D0D5DD", borderRadius: 10, outline: "none", boxShadow: "0 1px 2px rgba(16,24,40,0.04)", boxSizing: "border-box" }}
              />
              <button type="button" onClick={() => setShowPassword(v => !v)} aria-label="toggle password" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", height: 24, width: 24, border: "none", background: "transparent", color: "#667085", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
          </div>
          {error && <div style={{ color: "#B42318", background: "#FEE4E2", border: "1px solid #FECDCA", borderRadius: 8, padding: "8px 10px" }}>ผิดพลาด: {error}</div>}
          <button type="submit" disabled={loading} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid #4F63D6", background: loading ? "#93c5fd" : "#4F63D6", color: "#fff", fontWeight: 600, boxShadow: "0 1px 2px rgba(16,24,40,0.04)" }}>
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  );
}

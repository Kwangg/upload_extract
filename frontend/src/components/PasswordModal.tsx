"use client";

import React from "react";

type PasswordModalProps = {
  pendingFile: string | null;
  password: string;
  message?: string;
  uploading?: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export default function PasswordModal({
  pendingFile,
  password,
  message,
  uploading = false,
  onChange,
  onCancel,
  onSubmit,
}: PasswordModalProps) {
  if (!pendingFile) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: 380,
          maxWidth: "90%",
          background: "#fff",
          borderRadius: 10,
          boxShadow: "0 12px 28px rgba(0,0,0,0.25)",
          padding: 16,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, textAlign: "center" }}>ต้องใช้รหัสในการแตกไฟล์</div>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 10, textAlign: "center" }}>
          กรุณาใส่รหัสสำหรับ <code>{pendingFile}</code>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => onChange(e.target.value)}
          placeholder="รหัสผ่าน"
          style={{ width: 300, maxWidth: "100%", display: "block", margin: "0 auto", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }}
        />
        {message && (
          <div style={{ fontSize: 12, color: "#c62828", marginTop: 8, textAlign: "center" }}>{message}</div>
        )}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
          <button
            onClick={onCancel}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc", background: "#f5f5f5", cursor: "pointer" }}
          >
            ยกเลิก
          </button>
          <button
            onClick={onSubmit}
            disabled={uploading}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #0070f3", background: uploading ? "#eee" : "#0070f3", color: "#fff", cursor: uploading ? "not-allowed" : "pointer" }}
          >
            แตกไฟล์ด้วยรหัสผ่าน
          </button>
        </div>
      </div>
    </div>
  );
}
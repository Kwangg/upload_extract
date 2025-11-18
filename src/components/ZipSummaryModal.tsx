"use client";

import React from "react";

type Entry = { name: string; size?: number };

export default function ZipSummaryModal({
  visible,
  zipName,
  entries,
  totalSize,
  onClose,
}: {
  visible: boolean;
  zipName: string;
  entries: Entry[];
  totalSize?: number;
  onClose: () => void;
}) {
  if (!visible) return null;
  const sizeText = typeof totalSize === "number" && totalSize > 0
    ? `${(totalSize / (1024 * 1024)).toFixed(2)} MB`
    : "-";

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 92vw)",
          maxHeight: "80vh",
          background: "#fff",
          borderRadius: 10,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>สรุปไฟล์ที่ถูกบีบอัด</div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: "#555" }}>ZIP: {zipName}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, fontSize: 13 }}>
          <div>จำนวนไฟล์</div>
          <div style={{ textAlign: "right", fontWeight: 600 }}>{entries.length} รายการ</div>
          <div>ขนาดรวมโดยประมาณ</div>
          <div style={{ textAlign: "right", fontWeight: 600 }}>{sizeText}</div>
        </div>
        <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 8, background: "#fafafa" }}>
          <div style={{ fontSize: 13, color: "#333", marginBottom: 6 }}>รายการไฟล์</div>
          <div style={{ overflow: "auto", maxHeight: 360 }}>
            {entries.length === 0 ? (
              <div style={{ fontSize: 13, color: "#777" }}>ไม่มีรายการ</div>
            ) : (
              entries.map((e, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</div>
                  <div style={{ color: "#555" }}>{typeof e.size === "number" ? `${(e.size / 1024).toFixed(1)} KB` : ""}</div>
                </div>
              ))
            )}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #2563eb",
              background: "#2563eb",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
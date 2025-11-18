"use client";

import { useEffect, useRef } from "react";

type Props = {
  visible: boolean;
  zipName: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  zipping?: boolean;
  filesCount?: number;
};

export default function ZipNameModal({ visible, zipName, onChange, onConfirm, onCancel, zipping = false, filesCount = 0 }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [visible, onCancel, onConfirm]);

  if (!visible) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "90%", background: "#fff", borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.25)", padding: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>ตั้งชื่อไฟล์ ZIP</div>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>{filesCount} ไฟล์จะถูกบีบอัดเป็น ZIP</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={inputRef}
            value={zipName}
            onChange={(e) => onChange(e.target.value)}
            placeholder="เช่น: เอกสารโครงการ.zip"
            style={{ flex: 1, padding: "10px 12px", border: "1px solid #ccc", borderRadius: 8 }}
          />
          <button
            onClick={onConfirm}
            disabled={zipping || !zipName.trim()}
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: zipping || !zipName.trim() ? "not-allowed" : "pointer", fontWeight: 600 }}
          >
            บีบอัดและดาวน์โหลด
          </button>
          <button
            onClick={onCancel}
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #999", background: "#fff" }}
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
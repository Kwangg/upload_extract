"use client";
import React, { useEffect, useState } from "react";
import path from "path";

export default function G23Page() {
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [preview, setPreview] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/g23/list");
      const json = await res.json();
      if (json?.ok) setFiles(json.files || []);
      else setMessage(json?.error || "โหลดรายชื่อไฟล์ไม่สำเร็จ");
    } catch {
      setMessage("เกิดข้อผิดพลาดในการโหลดรายการไฟล์");
    } finally {
      setLoading(false);
    }
  };

  const previewFile = async (rel: string) => {
    setLoading(true);
    setMessage("");
    setPreview("");
    setSelected(rel);
    try {
      const res = await fetch("/api/g23/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: rel }),
      });
      const json = await res.json();
      if (json?.ok) {
        setPreview(json.previewHead || "");
        setMessage(`ถอดรหัสสำเร็จ: สร้างไฟล์ ${json.outputRelative} (ขนาด ${json.size} ไบต์)`);
      } else {
        setMessage(json?.error || "ถอดรหัสไม่สำเร็จ");
      }
    } catch {
      setMessage("เกิดข้อผิดพลาดในการถอดรหัสไฟล์");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  return (
    <main style={{ padding: 16, fontFamily: "sans-serif" }}>
      <h2 style={{ marginBottom: 8 }}>เปิดไฟล์ .g23/.d23</h2>
      {message && (
        <div style={{ marginBottom: 12, fontSize: 13, color: "#333" }}>{message}</div>
      )}
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={loadFiles}
              disabled={loading}
              style={{ padding: "6px 10px", border: "1px solid #999", borderRadius: 6, cursor: loading ? "not-allowed" : "pointer" }}
            >
              โหลดรายการไฟล์
            </button>
          </div>
          <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 8, maxHeight: 300, overflow: "auto" }}>
            {files.length === 0 ? (
              <div style={{ fontSize: 13, color: "#777" }}>{loading ? "กำลังโหลด..." : "ไม่มีไฟล์ .g23/.d23 ใน uploads"}</div>
            ) : (
              <ul style={{ listStyle: "none", paddingLeft: 0, margin: 0 }}>
                {files.map((f, i) => (
                  <li key={i} style={{ fontSize: 13, color: "#333", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 4px" }}>
                    <span>{f}</span>
                    <button
                      onClick={() => previewFile(f)}
                      disabled={loading}
                      style={{ padding: "4px 8px", border: "1px solid #aaa", borderRadius: 4, cursor: loading ? "not-allowed" : "pointer" }}
                    >
                      ดูเนื้อหา
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div style={{ flex: 2 }}>
          <div style={{ marginBottom: 8, fontSize: 12, color: "#555" }}>ไฟล์ที่เลือก: {selected || "(ยังไม่ได้เลือก)"}</div>
          <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 8, minHeight: 300, background: "#fafafa" }}>
            {preview ? (
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, color: "#222" }}>{preview}</pre>
            ) : (
              <div style={{ fontSize: 13, color: "#777" }}>{loading ? "กำลังโหลด preview..." : "ยังไม่มีเนื้อหาให้แสดง"}</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
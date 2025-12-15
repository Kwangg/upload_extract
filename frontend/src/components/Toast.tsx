"use client";

import React, { useEffect, useState } from "react";

type ToastItem = {
  id: number;
  type: "success" | "error" | "info" | "warning";
  message: string;
  timeout: number;
};

// Helper to emit toast from anywhere
export function emitToast(type: ToastItem["type"], message: string, timeout = 5000) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("app:toast", { detail: { type, message, timeout } })
    );
  }
}

export default function ToastGlobal() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [offsetTop, setOffsetTop] = useState<number>(16);

  useEffect(() => {
    // Compute offset below the sticky navbar
    const computeOffset = () => {
      if (typeof window === "undefined") return;
      const header = document.querySelector("header") as HTMLElement | null;
      const h = header?.offsetHeight ?? 56;
      setOffsetTop(h + 12);
    };
    computeOffset();
    window.addEventListener("resize", computeOffset);

    let idCounter = Date.now();
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Partial<ToastItem> | undefined;
      if (!detail || !detail.message) return;
      const id = ++idCounter;
      const type = (detail.type as ToastItem["type"]) || "info";
      const timeout = Number(detail.timeout ?? 5000);
      setItems((prev) => [...prev, { id, type, message: String(detail.message), timeout }]);
      // auto-remove
      setTimeout(() => {
        setItems((prev) => prev.filter((it) => it.id !== id));
      }, timeout);
    };
    window.addEventListener("app:toast", handler as EventListener);
    return () => {
      window.removeEventListener("app:toast", handler as EventListener);
      window.removeEventListener("resize", computeOffset);
    };
  }, []);

  const bg = (t: ToastItem["type"]) => {
    switch (t) {
      case "success":
        return "#2e7d32";
      case "error":
        return "#d32f2f";
      case "warning":
        return "#ed6c02";
      default:
        return "#1976d2";
    }
  };

  return (
    <div style={{ position: "fixed", right: 16, top: offsetTop, zIndex: 1000, display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it) => (
        <div
          key={it.id}
          style={{
            minWidth: 240,
            maxWidth: 360,
            color: "#fff",
            background: bg(it.type),
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            padding: "10px 12px",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ flex: 1, wordBreak: "break-word" }}>{it.message}</div>
          <button
            aria-label="Close notification"
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: 4,
              opacity: 0.9,
            }}
            title="ปิด"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
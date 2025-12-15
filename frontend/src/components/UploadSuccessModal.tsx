"use client";

import React from "react";
import Link from "next/link";

type UploadedItem = { displayName: string; relative: string; size: number; mime: string; uploadedAt: string };

export default function UploadSuccessModal({
  visible,
  onClose,
  uploadedItems,
  zipSummary,
  extractedFiles = [],
}: {
  visible: boolean;
  onClose: () => void;
  uploadedItems: UploadedItem[];
  zipSummary?: { name: string; entries: { name: string; size?: number }[]; total?: number } | null;
  extractedFiles?: string[];
}) {
  if (!visible) return null;

  const uniqueExtracted = Array.from(new Set(extractedFiles));

  // Build a simple tree from extracted file paths
  type Node = { [name: string]: Node } & { __file?: boolean };
  const buildTree = (paths: string[]): Node => {
    const root: Node = {};
    for (const p of paths) {
      const parts = p.split("/").filter(Boolean);
      let curr: Node = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        curr[part] = curr[part] || {};
        curr = curr[part] as Node;
        if (i === parts.length - 1) {
          curr.__file = true;
        }
      }
    }
    return root;
  };

  const tree = buildTree(uniqueExtracted);

  const renderTree = (node: Node, level = 0) => {
    const entries = Object.keys(node).filter((k) => k !== "__file").sort();
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {entries.map((key) => {
          const child = node[key] as Node;
          const isFile = !!child.__file && Object.keys(child).length === 1;
          return (
            <div key={`${level}-${key}`} style={{ marginLeft: level * 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>{isFile ? "📄" : "📁"}</span>
                <span style={{ fontSize: 13 }}>{key}</span>
              </div>
              {!isFile && renderTree(child, level + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ width: 520, maxWidth: "94vw", background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", padding: 20, position: "relative" }}>
        <button onClick={onClose} aria-label="close" style={{ position: "absolute", right: 14, top: 12, border: "none", background: "transparent", fontSize: 18, cursor: "pointer", color: "#111" }}>×</button>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#eaffef", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#10b981", fontSize: 24 }}>✓</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Upload Successful!</div>
           
        </div>
      
        <div style={{ marginTop: 12 }}>
            {/* Uploaded list */}
            {uploadedItems && uploadedItems.length > 0 && (
              <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Uploaded Files ({uploadedItems.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 160, overflowY: "auto" }}>
                  {uploadedItems.map((it, idx) => (
                    <div key={`${it.relative}-${idx}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18 }}>📦</span>
                      <div>
                        <div style={{ fontSize: 14 }}>{it.displayName}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{(it.size/(1024*1024)).toFixed(2)} MB • {it.mime || ""}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Zip summary */}
            {zipSummary && (
              <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Zip Summary</div>
                <div style={{ fontSize: 13, color: "#374151" }}>File: <strong>{zipSummary.name}</strong></div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Entries: {zipSummary.entries.length} • Total: {zipSummary.total ? (zipSummary.total/(1024*1024)).toFixed(2) : "-"} MB</div>
                <ul style={{ marginTop: 8, paddingLeft: 18, maxHeight: 150, overflowY: "auto" }}>
                  {zipSummary.entries.map((e, i) => (
                    <li key={`${e.name}-${i}`}>{e.name} {typeof e.size === "number" ? `(${(e.size/(1024*1024)).toFixed(2)} MB)` : ""}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Extracted files rendered as a tree */}
            {uniqueExtracted && uniqueExtracted.length > 0 && (
              <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Extracted Files ({uniqueExtracted.length})</div>
                <div style={{ maxHeight: 200, overflowY: "auto" }}>
                  {renderTree(tree)}
                </div>
              </div>
            )}
            {/* Footer actions: go to files page */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <Link
                href="/files"
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid #10b981",
                  background: "#10b981",
                  color: "#fff",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                ไปเรียกคืน
              </Link>
            </div>
        </div>
      </div>
    </div>
  );
}

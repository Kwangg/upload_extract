"use client";
import { useEffect, useMemo, useState } from "react";

type DirItem = { name: string; type: "dir" | "file"; mtime?: string; size?: number };

// ตั้งค่าเริ่มต้นให้ชี้ไปยัง root ของ uploads โดยใช้ '.'
const DEFAULT_REL_PATH = ".";

export default function FilesPage() {
  const [path, setPath] = useState<string>(DEFAULT_REL_PATH);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [children, setChildren] = useState<DirItem[]>([]);
  const [filePreview, setFilePreview] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [sqlSummary, setSqlSummary] = useState<
    { totalInserts: number; tables: { name: string; inserts: number }[] } | null
  >(null);

  const isSqlFile = useMemo(
    () => (selectedFile || "").toLowerCase().endsWith(".sql"),
    [selectedFile]
  );
  const isG23File = useMemo(() => {
    const s = (selectedFile || "").toLowerCase();
    return s.endsWith(".g23") || s.endsWith(".d23");
  }, [selectedFile]);

  // normalize path แบบง่าย: ตัด './' นำหน้าออก ถ้าเหลือว่างให้เป็น '.'
  const normalizeRel = (p: string) => {
    const cleaned = p.replace(/^\.\/+/, "").replace(/^\/+/, "");
    return cleaned.length === 0 ? "." : cleaned;
  };

  // สถานะสำหรับ tree แบบ lazy-load แต่ละโฟลเดอร์
  const [tree, setTree] = useState<Record<string, { expanded: boolean; children: DirItem[] | null; loading: boolean }>>({});

  const ensureChildren = async (dirPath: string) => {
    const rel = normalizeRel(dirPath);
    setTree((prev) => ({
      ...prev,
      [rel]: { expanded: true, children: prev[rel]?.children ?? null, loading: true },
    }));
    try {
      const res = await fetch(`/api/files/preview?path=${encodeURIComponent(rel)}&lines=1`);
      const data = await res.json();
      let kids: DirItem[] = data?.ok && data?.type === "directory" ? (data.children || []) : [];
      // กรองไม่ให้แสดงไฟล์ .zip ใน tree
      kids = kids.filter((d) => !(d.type === "file" && d.name.toLowerCase().endsWith(".zip")));
      setTree((prev) => ({
        ...prev,
        [rel]: { expanded: true, children: kids, loading: false },
      }));
    } catch (e) {
      setTree((prev) => ({
        ...prev,
        [rel]: { expanded: true, children: prev[rel]?.children ?? [], loading: false },
      }));
    }
  };

  const toggleDir = (dirPath: string) => {
    const rel = normalizeRel(dirPath);
    setTree((prev) => {
      const cur = prev[rel] || { expanded: false, children: null, loading: false };
      const next = { ...cur, expanded: !cur.expanded };
      const updated = { ...prev, [rel]: next };
      if (next.expanded && !cur.children && !cur.loading) {
        // lazy-load children เมื่อกดขยาย
        ensureChildren(rel);
      }
      return updated;
    });
  };

  async function loadPath(p: string) {
    setLoading(true);
    setError(null);
    setSelectedFile(null);
    setFilePreview([]);
    setSqlSummary(null);
    try {
      const res = await fetch(
        `/api/files/preview?path=${encodeURIComponent(p)}&lines=200`
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "โหลดข้อมูลไม่สำเร็จ");
      if (data.type === "directory") {
        // อัปเดต path ให้ตรงกับตำแหน่งปัจจุบัน
        const rel = normalizeRel(p);
        setPath(rel);
        setChildren(data.children || []);
        // ตั้งค่า tree ของโฟลเดอร์ root ให้ขยายและโหลด
        setTree((prev) => ({ ...prev, [rel]: { expanded: true, children: null, loading: false } }));
        ensureChildren(rel);
      } else {
        setChildren([]);
        setSelectedFile(p);
        setFilePreview(data.preview || []);
      }
    } catch (e: any) {
      setError(e?.message || "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  async function previewFile(fileName: string) {
    const p = `${path}/${fileName}`;
    setLoading(true);
    setError(null);
    setSelectedFile(p);
    setFilePreview([]);
    setSqlSummary(null);
    try {
      const lower = p.toLowerCase();
      if (lower.endsWith(".g23") || lower.endsWith(".d23")) {
        const res = await fetch("/api/g23/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: p }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "ถอดรหัสไฟล์ไม่สำเร็จ");
        const head = String(data.previewHead || "");
        setFilePreview(head.split(/\r?\n/));
      } else {
        const res = await fetch(
          `/api/files/preview?path=${encodeURIComponent(p)}&lines=300`
        );
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "โหลดไฟล์ไม่สำเร็จ");
        setFilePreview(data.preview || []);
      }
    } catch (e: any) {
      setError(e?.message || "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  // พรีวิวด้วยพาธสัมพัทธ์ที่ส่งมา (ใช้ใน tree)
  async function previewRel(p: string) {
    const rel = normalizeRel(p);
    setLoading(true);
    setError(null);
    setSelectedFile(rel);
    setFilePreview([]);
    setSqlSummary(null);
    try {
      const lower = rel.toLowerCase();
      if (lower.endsWith(".g23") || lower.endsWith(".d23")) {
        const res = await fetch("/api/g23/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: rel }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "ถอดรหัสไฟล์ไม่สำเร็จ");
        const head = String(data.previewHead || "");
        setFilePreview(head.split(/\r?\n/));
      } else {
        const res = await fetch(
          `/api/files/preview?path=${encodeURIComponent(rel)}&lines=300`
        );
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "โหลดไฟล์ไม่สำเร็จ");
        setFilePreview(data.preview || []);
      }
    } catch (e: any) {
      setError(e?.message || "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  async function summarizeSql() {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    setSqlSummary(null);
    try {
      const res = await fetch(
        `/api/sql/summary?path=${encodeURIComponent(selectedFile)}`
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "สรุปไฟล์ไม่สำเร็จ");
      setSqlSummary({ totalInserts: data.totalInserts, tables: data.tables });
    } catch (e: any) {
      setError(e?.message || "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  // renderer สำหรับ tree
  const renderChildren = (dirPath: string, depth: number) => {
    const rel = normalizeRel(dirPath);
    const node = tree[rel];
    const kids = node?.children || [];
    const isLoading = node?.loading;
    const indent = depth * 14;
    const currentRel = normalizeRel(path);
    const selectedRel = normalizeRel(selectedFile || "");

    return (
      <div>
        {kids.map((it) => {
          const childPath = rel === "." ? it.name : `${rel}/${it.name}`;
          // ซ่อนไฟล์ .zip ในมุมมอง tree
          if (it.type === "file" && it.name.toLowerCase().endsWith(".zip")) {
            return null;
          }
          if (it.type === "dir") {
            const childNode = tree[childPath];
            const expanded = childNode?.expanded || false;
            const isCurrent = currentRel === childPath;
            return (
              <div key={childPath}>
                <div
                  onClick={() => {
                    setSelectedFile(null);
                    setPath(childPath);
                    ensureChildren(childPath);
                  }}
                  style={{ padding: "6px 8px", border: "1px solid #eee", borderRadius: 6, background: isCurrent ? "#eef5ff" : "#fafafa", cursor: "pointer", marginTop: 6, marginBottom: 4, paddingLeft: indent, fontWeight: isCurrent ? 600 : 400 }}
                  title={isCurrent ? "โฟลเดอร์ปัจจุบัน" : "เปิดโฟลเดอร์"}
                >
                  <span style={{ marginRight: 6 }}>{expanded ? "▾" : "▸"}</span>
                  {isCurrent && <span style={{ color: "#2563eb", marginRight: 6 }}>●</span>}
                  📁 {it.name}
                </div>
                {expanded && <div style={{ marginLeft: 12 }}>{renderChildren(childPath, depth + 1)}</div>}
              </div>
            );
          }
          // file
          const isCurrentFile = selectedRel === childPath;
          return (
            <div
              key={childPath}
              onClick={() => previewRel(childPath)}
              style={{ padding: "6px 8px", border: "1px solid #eee", borderRadius: 6, background: isCurrentFile ? "#eef5ff" : "#fff", cursor: "pointer", marginTop: 6, paddingLeft: indent, fontWeight: isCurrentFile ? 600 : 400 }}
              title={isCurrentFile ? "ไฟล์ปัจจุบัน" : "คลิกเพื่อดูเนื้อหาไฟล์"}
            >
              {isCurrentFile && <span style={{ color: "#2563eb", marginRight: 6 }}>●</span>}
              📄 {it.name}
            </div>
          );
        })}
        {kids.length === 0 && !isLoading && (
          <div style={{ fontSize: 13, color: "#777", paddingLeft: indent }}>ไม่มีรายการในโฟลเดอร์นี้</div>
        )}
      </div>
    );
  };

  // ไม่มีการบันทึกไฟล์ถอดรหัสลง _preview อีกต่อไป

  useEffect(() => {
    // โหลดรายการของโฟลเดอร์เริ่มต้น
    loadPath(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // เมื่อ path เปลี่ยน ให้เตรียม node root และโหลดลูกแบบ lazy
  useEffect(() => {
    const rel = normalizeRel(path);
    setTree((prev) => ({ ...prev, [rel]: prev[rel] || { expanded: true, children: null, loading: false } }));
    ensureChildren(rel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>ไฟล์สำรองใน uploads</h2>
      
      {loading && (
        <div style={{ marginTop: 12, color: "#666" }}>กำลังโหลด...</div>
      )}
      {error && (
        <div style={{ marginTop: 12, color: "#c00" }}>ผิดพลาด: {error}</div>
      )}

      {/* มุมมองเริ่มต้น: ยังไม่เลือกเปิดโฟลเดอร์ (path = '.') ใช้รายการแบบตารางขอบมน */}
      {path === "." && !selectedFile ? (
        <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden", width: "100%", maxWidth: 980, margin: "0 auto" }}>
            {/* หัวตาราง */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 240px", columnGap: 12, padding: "10px 12px", background: "#fafafa", borderBottom: "1px solid #eee", fontWeight: 600 }}>
              <div>ชื่อ</div>
              <div style={{ textAlign: "right" }}>ประเภท</div>
              <div style={{ textAlign: "right" }}>อัพโหลดเมื่อ</div>
            </div>
            {/* รายการจาก root */}
            {(() => {
              let kids = tree["."]?.children || [];
              if (!kids.length) {
                return <div style={{ padding: "12px 14px", color: "#777" }}>ไม่มีรายการในโฟลเดอร์นี้</div>;
              }
              return kids.map((it, idx) => {
                const childPath = it.name; // root + name
                const isLast = idx === kids.length - 1;
                const uploadedAt = it.mtime ? new Date(it.mtime).toLocaleString() : "-";
                // ซ่อนไฟล์ .zip
                if (it.type === "file" && it.name.toLowerCase().endsWith(".zip")) {
                  return null;
                }
                return (
                  <div
                    key={`root-row-${childPath}`}
                    onClick={() => {
                      if (it.type === "dir") {
                        const next = `./${it.name}`;
                        setSelectedFile(null);
                        setPath(next);
                        ensureChildren(next);
                      } else {
                        previewRel(`./${it.name}`);
                      }
                    }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 120px 240px",
                      columnGap: 12,
                      padding: "12px 14px",
                      borderBottom: isLast ? "none" : "1px solid #eee",
                      cursor: "pointer",
                      background: "#fff",
                    }}
                    title={it.type === "dir" ? "เปิดโฟลเดอร์" : "พรีวิวไฟล์"}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{it.type === "dir" ? "📁" : "📄"}</span>
                      <span>{it.name}</span>
                    </div>
                    <div style={{ textAlign: "right", color: "#555" }}>{it.type === "dir" ? "โฟลเดอร์" : "ไฟล์"}</div>
                <div style={{ textAlign: "right", color: "#555" }}>{uploadedAt}</div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      ) : (
        /* แบ่งเลย์เอาต์ ซ้าย/ขวา 30/70 เมื่อเลือกโฟลเดอร์หรือกำลังพรีวิวไฟล์ */
        <div style={{ display: "flex", gap: 16, alignItems: "stretch", marginTop: 16, height: "calc(100vh - 180px)" }}>
          {/* ซ้าย 30%: รายการไฟล์/โฟลเดอร์แบบ tree */}
          <div style={{ width: "30%", minWidth: 260, display: "flex", flexDirection: "column", height: "100%" }}>
            {/* แสดง tree จาก root เสมอ เพื่อให้เห็นโฟลเดอร์อื่นคงอยู่ */}
            <div style={{ flex: 1, overflow: "auto" }}>{renderChildren(".", 0)}</div>
          </div>

          {/* ขวา 70%: พรีวิวและสรุป SQL */}
          <div style={{ width: "70%", display: "flex", flexDirection: "column", height: "100%" }}>
            {selectedFile ? (
              <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  {(() => {
                    const rel = (selectedFile || "").replace(/^\.\//, "");
                    const parts = rel.split("/").filter(Boolean);
                    const items: { label: string; path: string; clickable: boolean }[] = [];
                    items.push({ label: "uploads", path: ".", clickable: true });
                    let acc = ".";
                    for (let i = 0; i < parts.length; i++) {
                      const isLast = i === parts.length - 1;
                      acc = acc === "." ? parts[i] : `${acc}/${parts[i]}`;
                      items.push({ label: parts[i], path: acc, clickable: !isLast });
                    }
                    return items.map((it, idx) => (
                      <span
                        key={`${it.path}-${idx}`}
                        onClick={() => {
                          if (it.clickable) {
                            setPath(it.path);
                            loadPath(it.path);
                          }
                        }}
                        style={{ cursor: it.clickable ? "pointer" : "default", color: it.clickable ? "#06c" : "#333" }}
                      >
                        {it.label}
                        {idx < items.length - 1 ? <span style={{ color: "#aaa" }}> / </span> : null}
                      </span>
                    ));
                  })()}
                </div>
                <div style={{ fontWeight: 600, marginTop: 6 }}>ไฟล์: {selectedFile}</div>
                <pre
                  style={{
                    marginTop: 8,
                    padding: 12,
                    border: "1px solid #eee",
                    borderRadius: 6,
                    background: "#fafafa",
                    flex: 1,
                    overflow: "auto",
                    fontSize: 13,
                  }}
                >
                  {filePreview.join("\n")}
                </pre>
                {isSqlFile && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      onClick={summarizeSql}
                      style={{ padding: "6px 10px", fontSize: 13 }}
                    >
                      สรุป INSERT ตามตาราง
                    </button>
                  </div>
                )}
                {isG23File && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
                    พรีวิวนี้ถอดรหัสจาก base64 โดยไม่สร้างไฟล์ถาวร
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  {(() => {
                    const rel = (path || ".").replace(/^\.\//, "");
                    const parts = rel.split("/").filter(Boolean);
                    const items: { label: string; path: string; clickable: boolean }[] = [];
                    items.push({ label: "uploads", path: ".", clickable: true });
                    let acc = ".";
                    for (let i = 0; i < parts.length; i++) {
                      const isLast = i === parts.length - 1;
                      acc = acc === "." ? parts[i] : `${acc}/${parts[i]}`;
                      items.push({ label: parts[i], path: acc, clickable: !isLast });
                    }
                    return items.map((it, idx) => (
                      <span
                        key={`${it.path}-right-${idx}`}
                        onClick={() => {
                          if (it.clickable) {
                            setSelectedFile(null);
                            setPath(it.path);
                            ensureChildren(it.path);
                          }
                        }}
                        style={{ cursor: it.clickable ? "pointer" : "default", color: it.clickable ? "#06c" : "#333" }}
                      >
                        {it.label}
                        {idx < items.length - 1 ? <span style={{ color: "#aaa" }}> / </span> : null}
                      </span>
                    ));
                  })()}
                </div>
                <div style={{ marginTop: 8, border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden", background: "#fff", flex: 1 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 240px", columnGap: 12, padding: "10px 12px", background: "#fafafa", borderBottom: "1px solid #eee", fontWeight: 600 }}>
                    <div>ชื่อ</div>
                    <div style={{ textAlign: "right" }}>ประเภท</div>
                    <div style={{ textAlign: "right" }}>อัพโหลดเมื่อ</div>
                  </div>
                  {(() => {
                    const relPath = normalizeRel(path);
                    let kids = (tree[relPath]?.children) || [];
                    if (!kids.length) {
                      return <div style={{ padding: "12px 14px", color: "#777" }}>ไม่มีรายการในโฟลเดอร์นี้</div>;
                    }
                    return kids.map((it, idx) => {
                      const nextRel = path === "." ? `./${it.name}` : `${path}/${it.name}`;
                      const isLast = idx === kids.length - 1;
                      const uploadedAt = it.mtime ? new Date(it.mtime).toLocaleString() : "-";
                      // ซ่อนไฟล์ .zip
                      if (it.type === "file" && it.name.toLowerCase().endsWith(".zip")) {
                        return null;
                      }
                      return (
                        <div
                          key={`right-row-${nextRel}`}
                          onClick={() => {
                            if (it.type === "dir") {
                              setSelectedFile(null);
                              setPath(nextRel);
                              ensureChildren(nextRel);
                            } else {
                              previewRel(nextRel);
                            }
                          }}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 120px 240px",
                            columnGap: 12,
                            padding: "12px 14px",
                            borderBottom: isLast ? "none" : "1px solid #eee",
                            cursor: "pointer",
                            background: "#fff",
                          }}
                          title={it.type === "dir" ? "เปิดโฟลเดอร์" : "พรีวิวไฟล์"}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span>{it.type === "dir" ? "📁" : "📄"}</span>
                            <span>{it.name}</span>
                          </div>
                          <div style={{ textAlign: "right", color: "#555" }}>{it.type === "dir" ? "โฟลเดอร์" : "ไฟล์"}</div>
                          <div style={{ textAlign: "right", color: "#555" }}>{uploadedAt}</div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {sqlSummary && (
              <div style={{ marginTop: 16 }}>
                <div>
                  รวม INSERT ทั้งหมด: <b>{sqlSummary.totalInserts}</b>
                </div>
                <div style={{ marginTop: 8 }}>ตารางที่พบ:</div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 6,
                    maxWidth: 520,
                  }}
                >
                  {sqlSummary.tables.map((t) => (
                    <>
                      <div
                        key={`${t.name}-name`}
                        style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}
                      >
                        {t.name}
                      </div>
                      <div
                        key={`${t.name}-count`}
                        style={{ padding: "6px 8px", borderBottom: "1px solid #f0f0f0", textAlign: "right" }}
                      >
                        {t.inserts}
                      </div>
                    </>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
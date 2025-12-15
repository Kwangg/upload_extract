"use client";
import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "@/lib/api";

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
  // การเรียงลำดับตามวันที่อัพโหลด (true = ใหม่→เก่า, false = เก่า→ใหม่)
  const [sortDesc, setSortDesc] = useState<boolean>(true);

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
  const dirOf = (p: string) => {
    const rel = normalizeRel(p);
    if (rel === ".") return ".";
    const parts = rel.split("/").filter(Boolean);
    parts.pop();
    return parts.length ? parts.join("/") : ".";
  };

  // จัดรูปแบบวันที่เป็น dd/mm/yyyy และเวลาแบบ 24 ชั่วโมง (HH:mm)
  const formatUploadAt = (mtime?: string) => {
    if (!mtime) return "-";
    const d = new Date(mtime);
    if (isNaN(d.getTime())) return "-";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  };

  // ฟังก์ชันลบไฟล์/โฟลเดอร์ตามพาธสัมพัทธ์ของผู้ใช้
  const deleteItem = async (relPath: string) => {
    const ok = window.confirm("ยืนยันการลบรายการนี้หรือไม่?");
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE}/files/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ path: relPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || "ลบไม่สำเร็จ");
      }
      // รีเฟรชรายการปัจจุบัน
      await loadPath(path);
    } catch (e: any) {
      alert(e?.message || "เกิดข้อผิดพลาดในการลบ");
    }
  };

  // สถานะสำหรับ tree แบบ lazy-load แต่ละโฟลเดอร์
  const [tree, setTree] = useState<Record<string, { expanded: boolean; children: DirItem[] | null; loading: boolean }>>({});

  const ensureChildren = async (dirPath: string) => {
    const rel = normalizeRel(dirPath);
    setTree((prev) => ({
      ...prev,
      [rel]: { expanded: prev[rel]?.expanded ?? false, children: prev[rel]?.children ?? null, loading: true },
    }));
    try {
      const res = await fetch(`${API_BASE}/files/preview?path=${encodeURIComponent(rel)}&lines=1`, { credentials: "include" });
      const data = await res.json();
      let kids: DirItem[] = data?.ok && data?.type === "directory" ? (data.children || []) : [];
      // กรองไม่ให้แสดงไฟล์ .zip และ .rar ใน tree
      kids = kids.filter((d) => {
        if (d.type !== "file") return true;
        const n = d.name.toLowerCase();
        return !(n.endsWith(".zip") || n.endsWith(".rar"));
      });
      // ขจัดรายการซ้ำ (ตามชื่อและชนิด) เพื่อไม่ให้โฟลเดอร์แสดงซ้ำ
      const seen = new Set<string>();
      kids = kids.filter((d) => {
        const key = `${d.type}:${d.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setTree((prev) => ({
        ...prev,
        [rel]: { expanded: prev[rel]?.expanded ?? false, children: kids, loading: false },
      }));
    } catch (e) {
      setTree((prev) => ({
        ...prev,
        [rel]: { expanded: prev[rel]?.expanded ?? false, children: prev[rel]?.children ?? [], loading: false },
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

  // ขยาย tree ตามเส้นทางที่ระบุ และโหลด children ของแต่ละระดับ
  async function expandToPath(targetPath: string) {
    const rel = normalizeRel(targetPath);
    // เตรียมให้ root แสดงผล
    setTree((prev) => {
      const root = prev["."] || { expanded: false, children: null, loading: false };
      return { ...prev, ["."]: { ...root, expanded: true } };
    });
    await ensureChildren(".");

    if (rel === ".") return;

    const parts = rel.split("/");
    let accum = ".";
    for (const part of parts) {
      accum = accum === "." ? part : `${accum}/${part}`;
      const level = accum;
      // ทำเครื่องหมายว่าขยายในระดับนี้
      setTree((prev) => {
        const cur = prev[level] || { expanded: false, children: null, loading: false };
        return { ...prev, [level]: { ...cur, expanded: true } };
      });
      // โหลด children ของระดับนี้แบบ lazy
      await ensureChildren(level);
    }
  }

  async function loadPath(p: string) {
    setLoading(true);
    setError(null);
    setSelectedFile(null);
    setFilePreview([]);
    setSqlSummary(null);
    try {
      const res = await fetch(`${API_BASE}/files/preview?path=${encodeURIComponent(p)}&lines=200`, { credentials: "include" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "โหลดข้อมูลไม่สำเร็จ");
      if (data.type === "directory") {
        // อัปเดต path ให้ตรงกับตำแหน่งปัจจุบัน
        const rel = normalizeRel(p);
        setPath(rel);
        setChildren(data.children || []);
        // อัปเดต tree ของโฟลเดอร์ (ไม่บังคับให้ขยาย)
        setTree((prev) => ({ ...prev, [rel]: { expanded: prev[rel]?.expanded ?? false, children: null, loading: false } }));
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
        const res = await fetch(`${API_BASE}/g23/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: p }),
          credentials: "include",
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "ถอดรหัสไฟล์ไม่สำเร็จ");
        const head = String(data.previewHead || "");
        setFilePreview(head.split(/\r?\n/));
      } else {
        const res = await fetch(`${API_BASE}/files/preview?path=${encodeURIComponent(p)}&lines=300`, { credentials: "include" });
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
        const res = await fetch(`${API_BASE}/g23/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: rel }),
          credentials: "include",
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "ถอดรหัสไฟล์ไม่สำเร็จ");
        const head = String(data.previewHead || "");
        setFilePreview(head.split(/\r?\n/));
      } else {
        const res = await fetch(`${API_BASE}/files/preview?path=${encodeURIComponent(rel)}&lines=300`, { credentials: "include" });
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
      const res = await fetch(`${API_BASE}/sql/summary?path=${encodeURIComponent(selectedFile)}`, { credentials: "include" });
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
    // ขจัดรายการซ้ำในฝั่ง renderer ด้วย (กันกรณี state ค้าง)
    const rawKids = node?.children || [];
    const seen = new Set<string>();
    const kids = rawKids.filter((d) => {
      const key = `${d.type}:${d.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // เรียงลำดับให้สอดคล้องกับฝั่งขวา (ตามวันที่อัพโหลด)
    kids.sort((a, b) => {
      const ta = a.mtime ? new Date(a.mtime).getTime() : (sortDesc ? -Infinity : Infinity);
      const tb = b.mtime ? new Date(b.mtime).getTime() : (sortDesc ? -Infinity : Infinity);
      return sortDesc ? (tb - ta) : (ta - tb);
    });
    const isLoading = node?.loading;
    const indent = depth * 14;
    const currentRel = normalizeRel(path);
    const selectedRel = normalizeRel(selectedFile || "");

    return (
      <div>
        {kids.map((it) => {
          const childPath = rel === "." ? it.name : `${rel}/${it.name}`;
          const childPathNorm = normalizeRel(childPath);
          // ซ่อนไฟล์ .zip และ .rar ในมุมมอง tree
          if (it.type === "file") {
            const n = it.name.toLowerCase();
            if (n.endsWith(".zip") || n.endsWith(".rar")) {
              return null;
            }
          }
          if (it.type === "dir") {
            const childNode = tree[childPathNorm];
            const expanded = childNode?.expanded || false;
            const isCurrent = currentRel === childPathNorm;
            return (
              <div key={childPathNorm}>
                <div
                  onClick={() => {
                    // คลิกโฟลเดอร์ใน tree: เปลี่ยน path และสลับยุบ/ขยาย โฟลเดอร์ที่คลิก
                    setSelectedFile(null);
                    setPath(childPathNorm);
                    toggleDir(childPathNorm);
                  }}
                  style={{ padding: "6px 8px", border: "1px solid #eee", borderRadius: 6, background: isCurrent ? "#eef5ff" : "#fafafa", cursor: "pointer", marginTop: 6, marginBottom: 4, paddingLeft: indent, fontWeight: isCurrent ? 600 : 400 }}
                  title={isCurrent ? "โฟลเดอร์ปัจจุบัน" : "เปิดโฟลเดอร์"}
                >
                  <span style={{ marginRight: 6 }}>{expanded ? "▾" : "▸"}</span>
                  {isCurrent && <span style={{ color: "#2563eb", marginRight: 6 }}>●</span>}
                  📁 {it.name}
                </div>
                {expanded && <div style={{ marginLeft: 12 }}>{renderChildren(childPathNorm, depth + 1)}</div>}
              </div>
            );
          }
          // file
          const isCurrentFile = selectedRel === childPathNorm;
          return (
            <div
              key={childPathNorm}
              onClick={() => previewRel(childPathNorm)}
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

  // เมื่อ path เปลี่ยน ให้ขยาย tree ตามเส้นทางนั้นทันที (auto-expand ฝั่งซ้าย)
  useEffect(() => {
    const rel = normalizeRel(path);
    (async () => {
      await expandToPath(rel);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return (
    <div>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 200px 56px", columnGap: 12, padding: "10px 12px", background: "#fafafa", borderBottom: "1px solid #eee", fontWeight: 600 }}>
              <div>ชื่อ</div>
              <div style={{ textAlign: "right" }}>ประเภท</div>
              <div style={{ textAlign: "right" }}>
                <button
                  onClick={() => setSortDesc((v) => !v)}
                  title={sortDesc ? "คลิกเพื่อเรียงเก่า→ใหม่" : "คลิกเพื่อเรียงใหม่→เก่า"}
                  style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 600 }}
                >
                  อัพโหลดเมื่อ {sortDesc ? "↓" : "↑"}
                </button>
              </div>
            </div>
            {/* รายการจาก root */}
            {(() => {
              let kids = tree["."]?.children || [];
              // ซ่อนไฟล์ .zip และ .rar และเรียงตามวันที่อัพโหลด
              kids = kids.filter((d) => {
                if (d.type !== "file") return true;
                const n = d.name.toLowerCase();
                return !(n.endsWith(".zip") || n.endsWith(".rar"));
              });
              // ขจัดซ้ำโดยชื่อ+ชนิด
              {
                const seen = new Set<string>();
                kids = kids.filter((d) => {
                  const key = `${d.type}:${d.name}`;
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });
              }
              kids.sort((a, b) => {
                const ta = a.mtime ? new Date(a.mtime).getTime() : (sortDesc ? -Infinity : Infinity);
                const tb = b.mtime ? new Date(b.mtime).getTime() : (sortDesc ? -Infinity : Infinity);
                return sortDesc ? (tb - ta) : (ta - tb);
              });
              if (!kids.length) {
                return <div style={{ padding: "12px 14px", color: "#777" }}>ไม่มีรายการในโฟลเดอร์นี้</div>;
              }
              return kids.map((it, idx) => {
                const childPath = it.name; // root + name
                const isLast = idx === kids.length - 1;
                const uploadedAt = formatUploadAt(it.mtime);
                return (
                  <div
                    key={`root-row-${childPath}`}
                    onClick={() => {
                      if (it.type === "dir") {
                        const next = `./${it.name}`;
                        setSelectedFile(null);
                        setPath(next);
                        // ขยาย tree ให้ตรงกับโฟลเดอร์ที่เปิด
                        expandToPath(next);
                      } else {
                        previewRel(`./${it.name}`);
                      }
                    }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 120px 200px 56px",
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
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                      <button
                        title="ลบ"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rel = `./${it.name}`;
                          deleteItem(rel);
                        }}
                        style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, lineHeight: 0 }}
                      >
                        <img src="/delete.svg" alt="ลบ" width={16} height={16} style={{ display: "inline-block" }} />
                      </button>
                    </div>
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
                            // ซิงค์ tree ฝั่งซ้ายให้ขยายตาม breadcrumb
                            expandToPath(it.path);
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
                    <div style={{ textAlign: "right" }}>
                      <button
                        onClick={() => setSortDesc((v) => !v)}
                        title={sortDesc ? "คลิกเพื่อเรียงเก่า→ใหม่" : "คลิกเพื่อเรียงใหม่→เก่า"}
                        style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 600 }}
                      >
                        อัพโหลดเมื่อ {sortDesc ? "↓" : "↑"}
                      </button>
                    </div>
                  </div>
                  {normalizeRel(path) !== "." && (
                    <div
                      key={`right-row-parent`}
                      onClick={() => {
                        const parent = dirOf(path);
                        setSelectedFile(null);
                        setPath(parent);
                        expandToPath(parent);
                      }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 120px 200px 56px",
                      columnGap: 12,
                      padding: "12px 14px",
                      borderBottom: "1px solid #eee",
                      cursor: "pointer",
                      background: "#fff",
                    }}
                    title="ขึ้นไปโฟลเดอร์แม่"
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>📁</span>
                      <span>..</span>
                    </div>
                    <div style={{ textAlign: "right", color: "#555" }}>โฟลเดอร์</div>
                      <div style={{ textAlign: "right", color: "#555" }}>-</div>
                      <div></div>
                  </div>
                )}
                {(() => {
                  const relPath = normalizeRel(path);
                  let kids = (tree[relPath]?.children) || [];
                    // ซ่อนไฟล์ .zip และ .rar และเรียงตามวันที่อัพโหลด
                    kids = kids.filter((d) => {
                      if (d.type !== "file") return true;
                      const n = d.name.toLowerCase();
                      return !(n.endsWith(".zip") || n.endsWith(".rar"));
                    });
                    kids.sort((a, b) => {
                      const ta = a.mtime ? new Date(a.mtime).getTime() : (sortDesc ? -Infinity : Infinity);
                      const tb = b.mtime ? new Date(b.mtime).getTime() : (sortDesc ? -Infinity : Infinity);
                      return sortDesc ? (tb - ta) : (ta - tb);
                    });
                    if (!kids.length) {
                      return <div style={{ padding: "12px 14px", color: "#777" }}>ไม่มีรายการในโฟลเดอร์นี้</div>;
                    }
                    return kids.map((it, idx) => {
                      const nextRel = path === "." ? `./${it.name}` : `${path}/${it.name}`;
                      const isLast = idx === kids.length - 1;
                      const uploadedAt = formatUploadAt(it.mtime);
                      return (
                        <div
                          key={`right-row-${nextRel}`}
                          onClick={() => {
                            if (it.type === "dir") {
                              setSelectedFile(null);
                              setPath(nextRel);
                              // ซิงค์และแตก tree ฝั่งซ้ายตามโฟลเดอร์ที่เปิดฝั่งขวา
                              expandToPath(nextRel);
                            } else {
                              previewRel(nextRel);
                            }
                          }}
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 120px 200px 56px",
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
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                            <button
                              title="ลบ"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteItem(nextRel);
                              }}
                              style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, lineHeight: 0 }}
                            >
                              <img src="/delete.svg" alt="ลบ" width={16} height={16} style={{ display: "inline-block" }} />
                            </button>
                          </div>
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

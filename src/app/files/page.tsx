"use client";
import { useEffect, useMemo, useState } from "react";

type DirItem = { name: string; type: "dir" | "file" };

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
        setPath(normalizeRel(p));
        setChildren(data.children || []);
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

  // ไปยังโฟลเดอร์แม่ของพาธปัจจุบัน
  function goParent() {
    if (path === ".") return;
    const parts = path.split("/").filter(Boolean);
    if (parts.length <= 1) {
      setPath(".");
      loadPath(".");
      return;
    }
    const parent = parts.slice(0, -1).join("/");
    setPath(parent);
    loadPath(parent);
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

  // ไม่มีการบันทึกไฟล์ถอดรหัสลง _preview อีกต่อไป

  useEffect(() => {
    // โหลดรายการของโฟลเดอร์เริ่มต้น
    loadPath(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>ไฟล์สำรองใน uploads</h2>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          style={{ width: 560, padding: 8, fontSize: 14 }}
          placeholder="ระบุพาธสัมพัทธ์ภายใต้ uploads"
        />
        <button
          onClick={() => loadPath(path)}
          style={{ padding: "8px 12px", fontSize: 14 }}
        >
          โหลดรายการ
        </button>
        <button
          onClick={() => { setPath("."); loadPath("."); }}
          style={{ padding: "8px 12px", fontSize: 14 }}
          title="ไปยัง root ของ uploads"
        >
          ไปที่ root
        </button>
        <button
          onClick={goParent}
          style={{ padding: "8px 12px", fontSize: 14 }}
          title="ย้อนกลับไปโฟลเดอร์แม่"
        >
          ย้อนกลับ
        </button>
      </div>
      {loading && (
        <div style={{ marginTop: 12, color: "#666" }}>กำลังโหลด...</div>
      )}
      {error && (
        <div style={{ marginTop: 12, color: "#c00" }}>ผิดพลาด: {error}</div>
      )}

      {/* แบ่งเลย์เอาต์ ซ้าย/ขวา 30/70 */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginTop: 16 }}>
        {/* ซ้าย 30%: รายการไฟล์/โฟลเดอร์ */}
        <div style={{ width: "30%", minWidth: 260 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>ภายใน: {path}</div>
          {children.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 8,
              }}
            >
              {children.map((it) => (
                <div
                  key={it.name}
                  onClick={() => {
                    if (it.type === "file") {
                      previewFile(it.name);
                    } else {
                      loadPath(`${path}/${it.name}`);
                    }
                  }}
                  style={{
                    padding: 0,
                    border: "1px solid #eee",
                    borderRadius: 6,
                    background: it.type === "dir" ? "#fafafa" : "#fff",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                  title={it.type === "file" ? "คลิกเพื่อดูเนื้อหา" : "คลิกเพื่อเปิดโฟลเดอร์"}
                >
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ width: "30%", padding: "8px 10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {it.type === "dir" ? "📁" : "📄"} {it.name}
                    </div>
                    <div style={{ width: "70%", padding: "8px 10px", borderLeft: "1px solid #eee", color: "#555", fontSize: 13 }}>
                      ชนิด: {it.type === "file" ? "ไฟล์" : "โฟลเดอร์"} • {it.type === "file" ? "คลิกเพื่อดูเนื้อหา" : "คลิกเพื่อเปิดโฟลเดอร์"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#777" }}>ไม่มีรายการในโฟลเดอร์นี้</div>
          )}
        </div>

        {/* ขวา 70%: พรีวิวและสรุป SQL */}
        <div style={{ width: "70%" }}>
          {selectedFile ? (
            <div>
              <div style={{ fontWeight: 600 }}>ไฟล์: {selectedFile}</div>
              <pre
                style={{
                  marginTop: 8,
                  padding: 12,
                  border: "1px solid #eee",
                  borderRadius: 6,
                  background: "#fafafa",
                  maxHeight: 400,
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
            <div style={{ fontSize: 13, color: "#777" }}>เลือกไฟล์เพื่อดูเนื้อหา</div>
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
    </div>
  );
}
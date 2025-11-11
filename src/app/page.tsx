"use client";

import { useState } from "react";
import path from "path";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [message, setMessage] = useState<string>("");
  const [uploading, setUploading] = useState<boolean>(false);
  const [extractedFiles, setExtractedFiles] = useState<string[]>([]);
  const [extractedGroups, setExtractedGroups] = useState<{
    zipRelative: string;
    extractRelative: string;
    entries: string[];
  }[]>([]);
  const [pendingPasswordFile, setPendingPasswordFile] = useState<string | null>(null);
  const [manualPassword, setManualPassword] = useState<string>("bizpoten1234");
  // สถานะสำหรับ auto-extract
  const [autoExtracting, setAutoExtracting] = useState<boolean>(false);
  const [autoExtractProgress, setAutoExtractProgress] = useState<number>(0);
  const [autoExtractResults, setAutoExtractResults] = useState<{name:string; ok:boolean; err?:string}[]>([]);

  // Auto-extract ทุกไฟล์ใน entries หลัง upload สำเร็จ
  const autoExtractAll = async (groups: typeof extractedGroups) => {
    const allEntries: {zipRelative:string, extractRelative:string, entry:string}[] = [];
    for (const g of groups) {
      for (const e of g.entries) {
        allEntries.push({zipRelative:g.zipRelative, extractRelative:g.extractRelative, entry:e});
      }
    }
    if (allEntries.length === 0) return;
    setAutoExtracting(true);
    setAutoExtractProgress(0);
    setAutoExtractResults([]);
    const results: {name:string; ok:boolean; err?:string}[] = [];
    const pwd = "bizpoten1234";
    for (let i = 0; i < allEntries.length; i++) {
      const {zipRelative, entry} = allEntries[i];
      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({fileName: zipRelative, password: pwd, targetEntry: entry}),
        });
        const json = await res.json();
        if (res.ok) {
          results.push({name: entry, ok: true});
          // รวมผลลัพธ์ไฟล์ใหม่เข้า state
          setExtractedFiles(prev => [...prev, ...(json.extractedFiles||[])]);
          setExtractedGroups(prev => [...prev, ...(json.extractedGroups||[])]);
        } else {
          results.push({name: entry, ok: false, err: json.error||"แตกไฟล์ไม่สำเร็จ"});
        }
      } catch (e) {
        results.push({name: entry, ok: false, err: "Exception"});
      }
      setAutoExtractProgress(Math.round(((i+1)/allEntries.length)*100));
      setAutoExtractResults([...results]);
    }
    setAutoExtracting(false);
    setMessage(`แตกไฟล์เสร็จ (${results.filter(r=>r.ok).length}/${results.length})`);
  };

  // แตกไฟล์ซ้อน (.zip/.rar ภายในผลการแตกเดิม) โดยอัตโนมัติด้วยรหัสผ่านค่าเริ่มต้น 1234
  const extractNestedArchive = async (archiveRelative: string) => {
    const pwd = "bizpoten1234";
    // โฟลเดอร์ที่ไฟล์ซ้อนอยู่ (เช่น 1762332154016-______________________.zip จะอยู่ใน uploads/1762332154016-______________________/)
    const outputDir = path.dirname(archiveRelative);
    try {
      setUploading(true);
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: archiveRelative, password: pwd, outputDir }),
      });
      const json = await res.json();
      if (res.ok) {
        setMessage(`แตกไฟล์ซ้อนสำเร็จ: ${archiveRelative}`);
        setExtractedFiles((prev) => [...prev, ...(json.extractedFiles || [])]);
        setExtractedGroups((prev) => [...prev, ...(json.extractedGroups || [])]);
      } else {
        if (json?.requiresPassword) {
          setMessage(json.error || "ต้องใช้รหัสผ่านในการแตกไฟล์ซ้อน");
          setPendingPasswordFile(archiveRelative);
        } else {
          setMessage(json.error || "แตกไฟล์ซ้อนไม่สำเร็จ");
        }
      }
    } catch (e) {
      setMessage("เกิดข้อผิดพลาดในการแตกไฟล์ซ้อน");
    } finally {
      setUploading(false);
    }
  };

  const extractWithPassword = async (fileName: string, pwd: string, outputDir?: string) => {
    try {
      setUploading(true);
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, password: pwd, outputDir }),
      });
      const json = await res.json();
      if (res.ok) {
        setMessage(`แตกไฟล์ด้วยรหัสผ่านสำเร็จ: ${fileName}`);
        setExtractedFiles((prev) => [...prev, ...(json.extractedFiles || [])]);
        setExtractedGroups((prev) => [...prev, ...(json.extractedGroups || [])]);
        setPendingPasswordFile(null);
      } else {
        if (json?.requiresPassword) {
          setMessage(json.error || "รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่");
          setPendingPasswordFile(fileName);
        } else {
          setMessage(json.error || "แตกไฟล์ด้วยรหัสผ่านไม่สำเร็จ");
          setPendingPasswordFile(null);
        }
      }
    } catch (e) {
      setMessage("เกิดข้อผิดพลาดในการแตกไฟล์ด้วยรหัสผ่าน");
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setMessage("");
    setProgress(0);
    setExtractedFiles([]);
    setExtractedGroups([]);
  };

  const onUpload = async () => {
    if (!file) {
      setMessage("กรุณาเลือกไฟล์ .zip หรือ .rar ก่อน");
      return;
    }
    const extOk = [".zip", ".rar", ".d23", ".g23"].some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!extOk) {
      setMessage("ชนิดไฟล์ไม่ถูกต้อง (รองรับเฉพาะ .zip, .rar, .d23, .g23)");
      return;
    }

    setUploading(true);
    setMessage("");
    setProgress(0);
    setExtractedFiles([]);
    setExtractedGroups([]);

    const form = new FormData();
    form.append("file", file);

    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const pct = Math.round((evt.loaded / evt.total) * 100);
          setProgress(pct);
        }
      };
      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          try {
            const data = JSON.parse(xhr.responseText || "{}");
            if (xhr.status >= 200 && xhr.status < 300) {
              // หากต้องใช้รหัสผ่าน ให้ใช้รหัสเริ่มต้น 1234 โดยอัตโนมัติและลองแตกไฟล์อีกรอบ
              if (data.requiresPassword) {
                const pwd = "bizpoten1234";
                if (data.fileName) {
                  (async () => {
                    try {
                      const res = await fetch("/api/extract", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ fileName: data.fileName, password: pwd }),
                      });
                      const json = await res.json();
                      if (res.ok) {
                        setMessage(`แตกไฟล์ด้วยรหัสผ่านสำเร็จ: ${data.fileName}`);
                        setExtractedFiles(json.extractedFiles || []);
                        setExtractedGroups(json.extractedGroups || []);
                      } else {
                        if (json?.requiresPassword) {
                          setMessage(json.error || "ต้องใช้รหัสผ่าน กรุณากรอกรหัสเพื่อแตกไฟล์");
                          setPendingPasswordFile(data.fileName);
                        } else {
                          setMessage(json.error || "แตกไฟล์ด้วยรหัสผ่านไม่สำเร็จ");
                        }
                      }
                    } catch (e) {
                      setMessage("เกิดข้อผิดพลาดในการแตกไฟล์ด้วยรหัสผ่าน");
                    } finally {
                      setUploading(false);
                      resolve();
                    }
                  })();
                  return; // รอผลจาก /api/extract แทน
                } else {
                  setMessage("ไม่พบชื่อไฟล์สำหรับการแตกไฟล์ด้วยรหัสผ่าน");
                }
              } else {
                setMessage(`อัพโหลดสำเร็จ: ${data.fileName ?? file.name}`);
                if (data.extractedFiles && data.extractedFiles.length > 0) {
                  setExtractedFiles(data.extractedFiles);
                }
                if (data.extractedGroups && Array.isArray(data.extractedGroups)) {
                  setExtractedGroups(data.extractedGroups);
                  // เริ่มแตกไฟล์ทั้งหมดใน entries อัตโนมัติ
                  autoExtractAll(data.extractedGroups);
                }
              }
            } else {
              setMessage(data.error || "อัพโหลดไม่สำเร็จ");
            }
          } catch {
            setMessage("อัพโหลดไม่สำเร็จ");
          }
          setUploading(false);
          resolve();
        }
      };
      xhr.send(form);
    });
  };

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>อัพโหลดไฟล์ .zip / .d23 / .g23</h1>
      <p style={{ color: "#555", marginBottom: 16 }}>
        เลือกไฟล์เพื่ออัพโหลดไปยังเซิร์ฟเวอร์ (จำกัด 200MB)
      </p>
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <input type="file" accept=".zip,.rar,.d23,.g23" onChange={onFileChange} />
        <button
          onClick={onUpload}
          disabled={!file || uploading}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid #999",
            background: uploading ? "#eee" : "#fff",
            cursor: uploading ? "not-allowed" : "pointer",
          }}
        >
          {uploading ? "กำลังอัพโหลด..." : "อัพโหลด"}
        </button>
      </div>

      {(uploading || progress > 0) && !autoExtracting ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "#666" }}>ความคืบหน้า: {progress}%</div>
          <div style={{ height: 8, background: "#eee", borderRadius: 4 }}>
            <div
              style={{
                width: `${progress}%`,
                height: 8,
                background: "#4caf50",
                borderRadius: 4,
                transition: "width 0.2s",
              }}
            />
          </div>
        </div>
      ) : null}

      {autoExtracting ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "#666" }}>กำลังแตกไฟล์อัตโนมัติ: {autoExtractProgress}%</div>
          <div style={{ height: 8, background: "#eee", borderRadius: 4 }}>
            <div
              style={{
                width: `${autoExtractProgress}%`,
                height: 8,
                background: "#2196f3",
                borderRadius: 4,
                transition: "width 0.2s",
              }}
            />
          </div>
        </div>
      ) : null}

      {message && (
        <div style={{ marginTop: 16, color: message.includes("สำเร็จ") ? "#2e7d32" : "#d32f2f" }}>
          {message}
        </div>
      )}

      {!autoExtracting && autoExtractResults.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ marginBottom: 6 }}>สรุปการแตกไฟล์อัตโนมัติ</h4>
          <ul style={{ listStyle: "initial", paddingLeft: 20, margin: 0, fontSize: 14 }}>
            {autoExtractResults.map((r, i) => (
              <li key={i} style={{ color: r.ok ? "#2e7d32" : "#d32f2f" }}>
                {r.name} {r.ok ? "✓" : `✗ ${r.err||""}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingPasswordFile && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#444" }}>
            กรุณาใส่รหัสผ่านสำหรับ <code>{pendingPasswordFile}</code>
          </span>
          <input
            type="password"
            value={manualPassword}
            onChange={(e) => setManualPassword(e.target.value)}
            placeholder="รหัสผ่าน"
            style={{ padding: "6px 8px", border: "1px solid #ccc", borderRadius: 4 }}
          />
          <button
            onClick={() => extractWithPassword(pendingPasswordFile, manualPassword, pendingPasswordFile ? path.dirname(pendingPasswordFile) : undefined)}
            disabled={uploading}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #999",
              background: uploading ? "#eee" : "#fff",
              cursor: uploading ? "not-allowed" : "pointer",
            }}
          >
            ลองแตกด้วยรหัสผ่าน
          </button>
        </div>
      )}

      {extractedFiles.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>ไฟล์ที่แตกได้ ({extractedFiles.length} ไฟล์):</h3>
          <ul style={{ listStyle: "initial", paddingLeft: 20, margin: 0 }}>
            {extractedFiles.map((name, i) => (
              <li key={i} style={{ fontSize: 14, color: "#333" }}>
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {extractedGroups.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 8 }}>รายละเอียดการแตกไฟล์แบบกลุ่ม</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {extractedGroups.map((grp, idx) => {
              // จัดกลุ่มตามโฟลเดอร์ของ entry โดยแสดงเฉพาะชื่อไฟล์
              const folderMap = new Map<string, string[]>();
              for (const entry of grp.entries) {
                const lastSlash = entry.lastIndexOf("/");
                const folder = lastSlash >= 0 ? entry.slice(0, lastSlash) : "";
                const name = lastSlash >= 0 ? entry.slice(lastSlash + 1) : entry;
                const arr = folderMap.get(folder) || [];
                arr.push(name);
                folderMap.set(folder, arr);
              }
              const folders = Array.from(folderMap.entries());
              return (
                <div key={idx} style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>
                    จาก zip: <code>{grp.zipRelative}</code>
                  </div>
                  <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>
                    แตกไปที่: <code>{grp.extractRelative}</code>
                  </div>
                  {folders.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {folders.map(([folder, names]) => (
                        <div key={folder || "root"}>
                          <div style={{ fontSize: 13, color: "#444", marginBottom: 4 }}>
                            โฟลเดอร์: <code>{folder || "(ราก)"}</code>
                          </div>
                          <ul style={{ listStyle: "initial", paddingLeft: 20, margin: 0 }}>
                            {names.map((n, i) => (
                              <li key={i} style={{ fontSize: 14, color: "#333" }}>
                                {n}
                                {/** แสดงปุ่มแตกไฟล์ซ้อนเฉพาะเมื่อกลุ่มต้นทางเป็น ZIP และ entry เป็น .zip/.rar */}
                                {(() => {
                                  const lower = n.toLowerCase();
                                  const isArchive = lower.endsWith(".zip") || lower.endsWith(".rar");
                                  const groupIsZip = grp.zipRelative.toLowerCase().endsWith(".zip");
                                  if (!isArchive || !groupIsZip) return null;
                                  const rel = `${grp.extractRelative}/${folder ? folder + "/" : ""}${n}`;
                                  return (
                                    <button
                                      onClick={() => extractNestedArchive(rel)}
                                      style={{
                                        marginLeft: 8,
                                        padding: "2px 8px",
                                        fontSize: 12,
                                        borderRadius: 4,
                                        border: "1px solid #999",
                                        background: "#fff",
                                        cursor: "pointer",
                                      }}
                                    >
                                      แตกไฟล์ซ้อน
                                    </button>
                                  );
                                })()}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: "#777" }}>ไม่มีไฟล์ในกลุ่มนี้</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}

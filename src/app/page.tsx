"use client";

import { useState, useRef } from "react";
import { ZipWriter, BlobWriter, Uint8ArrayReader } from "@zip.js/zip.js";
import path from "path";
import { emitToast } from "../components/Toast";
import PasswordModal from "../components/PasswordModal";
import ZipNameModal from "../components/ZipNameModal";
// ลบการใช้งาน ZipSummaryModal ตามคำขอ: แสดงสรุปที่ฝั่งขวาแทน Popup

export default function UploadPage() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState<boolean>(false);
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [zipping, setZipping] = useState<boolean>(false);
  const [zipPendingFiles, setZipPendingFiles] = useState<File[]>([]);
  const [zipName, setZipName] = useState<string>("");
  const [zipSummary, setZipSummary] = useState<{ name: string; entries: { name: string; size?: number }[]; total?: number } | null>(null);

  // รายการไฟล์ที่อัพโหลด (สำหรับพาเนลด้านขวา)
  type UploadedItem = { displayName: string; relative: string; size: number; mime: string; uploadedAt: string };
  const [uploadedItems, setUploadedItems] = useState<UploadedItem[]>([]);
  
  // Helper: เคลียร์สถานะก่อนเริ่มเลือกไฟล์ใหม่
  const resetBeforeSelect = () => {
    setSelectedFiles([]);
    setMessage("");
    setProgress(0);
    setExtractedFiles([]);
    setExtractedGroups([]);
    setAutoExtractResults([]);
    setPendingPasswordFile(null);
    setManualPassword("");
    // เคลียร์รายการไฟล์ที่อัพโหลดทุกครั้งที่กดเลือกไฟล์
    setUploadedItems([]);
    // เคลียร์สรุป ZIP เพื่อซ่อนพาเนลขวาทันที
    setZipSummary(null);
  };

  // Helper: เปิดโมดัลรับรหัส พร้อมตั้งข้อความและเคลียร์รหัสเดิม
  const openPasswordModal = (fileName: string, msg?: string) => {
    if (msg) setMessage(msg);
    setManualPassword("");
    setPendingPasswordFile(fileName);
  };

  // บีบอัดไฟล์เป็น ZIP แล้วให้ผู้ใช้ตั้งชื่อและดาวน์โหลด
  const zipFilesAndDownload = async (files: File[], customName?: string) => {
    if (!files || files.length === 0) return;
    try {
      setZipping(true);
      const defaultName = files.length === 1 ? `${files[0].name.replace(/\.[^./]+$/, "")}.zip` : "archive.zip";
      const nameInput = (customName && customName.trim()) || defaultName;
      const zipName = nameInput.toLowerCase().endsWith(".zip") ? nameInput : `${nameInput}.zip`;
      const zipWriter = new ZipWriter(new BlobWriter("application/zip"));
      let totalSize = 0;
      const summaryEntries: { name: string; size?: number }[] = [];
      for (const f of files) {
        const buf = await f.arrayBuffer();
        await zipWriter.add(f.name, new Uint8ArrayReader(new Uint8Array(buf)));
        totalSize += f.size || 0;
        summaryEntries.push({ name: f.name, size: f.size });
      }
      const blob = await zipWriter.close();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      // ไม่แสดง Popup/Toast หลังบีบอัดไฟล์ ให้สรุปไปแสดงฝั่งขวาแทน
      setZipSummary({ name: zipName, entries: summaryEntries, total: totalSize });
    } catch (e) {
      emitToast("error", "บีบอัดไฟล์ไม่สำเร็จ");
    } finally {
      setZipping(false);
      setZipPendingFiles([]);
      setZipName("");
    }
  };

  // เริ่มบีบอัดจากไฟล์ที่เลือกไว้ในปุ่มเลือกไฟล์ (ไม่ต้องเลือกซ้ำ)
  const startZipFromSelected = () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      emitToast("warning", "กรุณาเลือกไฟล์ก่อนบีบอัด");
      return;
    }
    setZipPendingFiles(selectedFiles);
    const defaultName = selectedFiles.length === 1
      ? `${selectedFiles[0].name.replace(/\.[^./]+$/, "")}.zip`
      : "archive.zip";
    setZipName(defaultName);
    emitToast("info", "ตั้งชื่อ ZIP แล้วกดยืนยันเพื่อดาวน์โหลด");
  };

  const toast = (type: "success" | "error" | "info" | "warning", message: string) => {
    emitToast(type, message);
  };

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
    toast("info", "เริ่มแตกไฟล์อัตโนมัติจากรายการที่พบ");
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
          // รวมผลลัพธ์ไฟล์ใหม่เข้า state พร้อมปรับให้เป็น path สัมพันธ์กับ uploads
          const baseRel = Array.isArray(json.extractedGroups) && json.extractedGroups[0]?.extractRelative
            ? json.extractedGroups[0].extractRelative
            : outputDir || path.dirname(zipRelative);
          const normalized = (json.extractedFiles || []).map((e:string) => `${baseRel}/${e}`.replace(/\\/g, "/"));
          setExtractedFiles(prev => [...prev, ...normalized]);
          setExtractedGroups(prev => [...prev, ...(json.extractedGroups||[])]);
        } else {
          results.push({name: entry, ok: false, err: json.error||"แตกไฟล์ไม่สำเร็จ"});
          if (json?.requiresPassword) {
            // ต้องใช้รหัสผ่านสำหรับ entry นี้: ไม่แสดง toast
          } else {
            toast("error", `แตกไฟล์ไม่สำเร็จ: ${entry}`);
          }
        }
      } catch (e) {
        results.push({name: entry, ok: false, err: "Exception"});
        toast("error", `เกิดข้อผิดพลาดกับไฟล์: ${entry}`);
      }
      setAutoExtractProgress(Math.round(((i+1)/allEntries.length)*100));
      setAutoExtractResults([...results]);
    }
    setAutoExtracting(false);
    const okCount = results.filter(r=>r.ok).length;
    const total = results.length;
    setMessage(`แตกไฟล์เสร็จ (${okCount}/${total})`);
    toast(okCount === total ? "success" : "warning", `สรุปแตกไฟล์อัตโนมัติ: ${okCount}/${total}`);
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
        setMessage("แตกไฟล์ซ้อนสำเร็จ");
        toast("success", "แตกไฟล์ซ้อนสำเร็จ");
        // ปรับให้ extractedFiles เป็น path สัมพันธ์กับ uploads โดยรวม base ของโฟลเดอร์แตกไฟล์
        const baseRel = Array.isArray(json.extractedGroups) && json.extractedGroups[0]?.extractRelative
          ? json.extractedGroups[0].extractRelative
          : outputDir || path.dirname(archiveRelative);
        const normalized = (json.extractedFiles || []).map((e:string) => `${baseRel}/${e}`.replace(/\\/g, "/"));
        setExtractedFiles((prev) => [...prev, ...normalized]);
        setExtractedGroups((prev) => [...prev, ...(json.extractedGroups || [])]);
      } else {
        if (json?.requiresPassword) {
          // ไม่แสดง toast เมื่อระบบต้องการรหัสผ่าน
          openPasswordModal(archiveRelative, json.error || "ต้องใช้รหัสผ่านในการแตกไฟล์ซ้อน");
        } else {
          setMessage(json.error || "แตกไฟล์ซ้อนไม่สำเร็จ");
          toast("error", json.error || "แตกไฟล์ซ้อนไม่สำเร็จ");
        }
      }
    } catch (e) {
      setMessage("เกิดข้อผิดพลาดในการแตกไฟล์ซ้อน");
      toast("error", "เกิดข้อผิดพลาดในการแตกไฟล์ซ้อน");
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
        toast("success", `แตกไฟล์ด้วยรหัสผ่านสำเร็จ: ${fileName}`);
        // ปรับให้ extractedFiles เป็น path สัมพันธ์กับ uploads โดยรวม base ของโฟลเดอร์แตกไฟล์
        const baseRel = Array.isArray(json.extractedGroups) && json.extractedGroups[0]?.extractRelative
          ? json.extractedGroups[0].extractRelative
          : outputDir || path.dirname(fileName);
        const normalized = (json.extractedFiles || []).map((e:string) => `${baseRel}/${e}`.replace(/\\/g, "/"));
        setExtractedFiles((prev) => [...prev, ...normalized]);
        setExtractedGroups((prev) => [...prev, ...(json.extractedGroups || [])]);
        setPendingPasswordFile(null);
      } else {
        if (json?.requiresPassword) {
          // ไม่แสดง toast เมื่อยังต้องการรหัสผ่าน
          openPasswordModal(fileName, json.error || "รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่");
        } else {
          setMessage(json.error || "แตกไฟล์ด้วยรหัสผ่านไม่สำเร็จ");
          toast("error", json.error || "แตกไฟล์ด้วยรหัสผ่านไม่สำเร็จ");
          setPendingPasswordFile(null);
        }
      }
    } catch (e) {
      setMessage("เกิดข้อผิดพลาดในการแตกไฟล์ด้วยรหัสผ่าน");
      toast("error", "เกิดข้อผิดพลาดในการแตกไฟล์ด้วยรหัสผ่าน");
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    resetBeforeSelect();
    const allowed = files.filter((f) => [".zip", ".rar", ".d23", ".g23", ".sql"].some((ext) => f.name.toLowerCase().endsWith(ext)));
    if (allowed.length === 0) {
      setMessage("ชนิดไฟล์ไม่ถูกต้อง (รองรับเฉพาะ .zip, .rar, .d23, .g23, .sql)");
      emitToast("error", "ชนิดไฟล์ไม่ถูกต้อง (รองรับเฉพาะ .zip, .rar, .d23, .g23, .sql)");
      return;
    }
    setSelectedFiles(allowed);
    // ยกเลิกอัพโหลดอัตโนมัติ ต้องกดปุ่มอัพโหลดเอง
  };

  // Drag & Drop handlers สำหรับ Dropzone
  const onDropZoneDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
  const onDropZoneDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };
  const onDropZoneDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;
    resetBeforeSelect();
    const allowed = files.filter((f) => [".zip", ".rar", ".d23", ".g23", ".sql"].some((ext) => f.name.toLowerCase().endsWith(ext)));
    if (allowed.length === 0) {
      setMessage("ชนิดไฟล์ไม่ถูกต้อง (รองรับเฉพาะ .zip, .rar, .d23, .g23, .sql)");
      emitToast("error", "ชนิดไฟล์ไม่ถูกต้อง (รองรับเฉพาะ .zip, .rar, .d23, .g23, .sql)");
      return;
    }
    setSelectedFiles(allowed);
    emitToast("info", `เลือกไฟล์แล้ว ${allowed.length} ไฟล์`);
    // ไม่อัพโหลดอัตโนมัติ ให้ผู้ใช้กดปุ่มอัพโหลด
  };

  const onUpload = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      setMessage("กรุณาเลือกไฟล์ .zip/.rar/.d23/.g23/.sql ก่อน");
      toast("warning", "กรุณาเลือกไฟล์ .zip/.rar/.d23/.g23/.sql ก่อน");
      return;
    }

    setUploading(true);
    setMessage("");
    setProgress(0);
    setExtractedFiles([]);
    setExtractedGroups([]);

    const aggregatedGroups: { zipRelative: string; extractRelative: string; entries: string[] }[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const f = selectedFiles[i];
      const extOk = [".zip", ".rar", ".d23", ".g23", ".sql"].some((ext) => f.name.toLowerCase().endsWith(ext));
      if (!extOk) {
        toast("error", `ชนิดไฟล์ไม่ถูกต้อง: ${f.name}`);
        continue;
      }

      setMessage(`กำลังอัพโหลดไฟล์ ${i + 1}/${selectedFiles.length}: ${f.name}`);
      const form = new FormData();
      form.append("file", f);

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
                          toast("success", `แตกไฟล์ด้วยรหัสผ่านสำเร็จ: ${data.fileName}`);
                          const baseRel = Array.isArray(json.extractedGroups) && json.extractedGroups[0]?.extractRelative
                            ? json.extractedGroups[0].extractRelative
                            : path.dirname(data.fileName);
                          const normalized = (json.extractedFiles || []).map((e:string) => `${baseRel}/${e}`.replace(/\\/g, "/"));
                          setExtractedFiles((prev) => [...prev, ...normalized]);
                          if (json.extractedGroups && Array.isArray(json.extractedGroups)) {
                            aggregatedGroups.push(...json.extractedGroups);
                            setExtractedGroups((prev) => [...prev, ...json.extractedGroups]);
                          }
                        } else {
                          if (json?.requiresPassword) {
                            openPasswordModal(data.fileName, json.error || "ต้องใช้รหัสผ่าน กรุณากรอกรหัสเพื่อแตกไฟล์");
                          } else {
                            setMessage(json.error || "แตกไฟล์ด้วยรหัสผ่านไม่สำเร็จ");
                            toast("error", json.error || "แตกไฟล์ด้วยรหัสผ่านไม่สำเร็จ");
                          }
                        }
                      } catch (e) {
                        setMessage("เกิดข้อผิดพลาดในการแตกไฟล์ด้วยรหัสผ่าน");
                        toast("error", "เกิดข้อผิดพลาดในการแตกไฟล์ด้วยรหัสผ่าน");
                      } finally {
                        resolve();
                      }
                    })();
                    return;
                  } else {
                    setMessage("ไม่พบชื่อไฟล์สำหรับการแตกไฟล์ด้วยรหัสผ่าน");
                    toast("error", "ไม่พบชื่อไฟล์สำหรับการแตกไฟล์ด้วยรหัสผ่าน");
                  }
                } else {
                  setMessage(`อัพโหลดสำเร็จ: ${data.fileName ?? f.name}`);
                  toast("success", `อัพโหลดสำเร็จ: ${data.fileName ?? f.name}`);
                  if (data.extractedFiles && data.extractedFiles.length > 0) {
                    setExtractedFiles((prev) => [...prev, ...data.extractedFiles]);
                  }
                  if (data.extractedGroups && Array.isArray(data.extractedGroups)) {
                    aggregatedGroups.push(...data.extractedGroups);
                    setExtractedGroups((prev) => [...prev, ...data.extractedGroups]);
                  }
                  const rel = data.fileName ?? f.name;
                  const item = {
                    displayName: f.name,
                    relative: rel,
                    size: f.size,
                    mime: f.type || (f.name.toLowerCase().endsWith('.zip') ? 'application/zip' : ''),
                    uploadedAt: new Date().toLocaleString(),
                  } as { displayName: string; relative: string; size: number; mime: string; uploadedAt: string };
                  setUploadedItems((prev) => [item, ...prev]);
                }
              } else {
                setMessage(data.error || "อัพโหลดไม่สำเร็จ");
                toast("error", data.error || "อัพโหลดไม่สำเร็จ");
              }
            } catch {
              setMessage("อัพโหลดไม่สำเร็จ");
              toast("error", "อัพโหลดไม่สำเร็จ");
            }
            resolve();
          }
        };
        xhr.send(form);
      });
    }

    setUploading(false);
    if (aggregatedGroups.length > 0) {
      // เริ่มแตกไฟล์ทั้งหมดใน entries อัตโนมัติหลังอัพโหลดครบ
      autoExtractAll(aggregatedGroups);
    }
  };

  return (
    <main style={{ maxWidth: 1080, margin: "24px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 8, fontSize: 24, fontWeight: 700 }}>File Upload Manager</h1>
      <p style={{ color: "#555", marginBottom: 16 }}>อัพโหลดและจัดการไฟล์ของคุณ</p>
      {(() => {
        // เงื่อนไขการมี "รายละเอียดไฟล์" เพื่อให้ฝั่งขวาแสดงเฉพาะเมื่อมีรายละเอียดเท่านั้น
        const uniqueExtracted = Array.from(new Set(extractedFiles));
        const nestedArchivesCount = uniqueExtracted.filter((rel) => {
          const lower = rel.toLowerCase();
          return lower.endsWith('.zip') || lower.endsWith('.rar');
        }).length;
        const hasDetails = Boolean(zipSummary || nestedArchivesCount > 0 || extractedFiles.length > 0 || extractedGroups.length > 0);
        return (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {/* ซ้าย: ส่วนเลือกไฟล์และอัพโหลด (60%) - คงที่ และ sticky */}
            <div style={{ flex: 3, position: "sticky", top: 24, alignSelf: "flex-start" }}>
              <div
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: 24,
                  display: "flex",
                  gap: 16,
                  alignItems: "stretch",
                }}
              >
                {/* พื้นที่ลาก-วางไฟล์ */}
                <div
                  onDragOver={onDropZoneDragOver}
                  onDragLeave={onDropZoneDragLeave}
                  onDrop={onDropZoneDrop}
                  onClick={() => {
                    // เคลียร์รายละเอียดก่อนหน้าและเปิดตัวเลือกไฟล์
                    resetBeforeSelect();
                    fileInputRef.current?.click();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      resetBeforeSelect();
                      fileInputRef.current?.click();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  style={{
                    flex: 1,
                    border: "2px dashed #bbb",
                    borderRadius: 8,
                    padding: 24,
                    minHeight: 280,
                    background: dragOver ? "#f0f9ff" : "#fafafa",
                    color: "#555",
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                  title="ลากไฟล์ .zip/.rar/.d23/.g23 มาวางที่นี่"
                >
                  <div style={{ fontSize: 14 }}>ลากไฟล์ .zip/.rar/.d23/.g23/.sql มาวางที่นี่</div>
                  <div style={{ fontSize: 12, color: "#777" }}>หรือคลิกที่พื้นที่นี้เพื่อเลือกไฟล์</div>
                </div>
                {/* แถบปุ่มด้านขวา: 2 บรรทัด */}
                <div style={{ width: 260, display: "flex", flexDirection: "column", gap: 10 }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,.rar,.d23,.g23,.sql,.SQL"
                    multiple
                    onChange={onFileChange}
                    style={{ display: "none" }}
                  />
                  {/* ปุ่มอัพโหลด และ ปุ่มบีบอัดไฟล์ แยกบรรทัด */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <button
                      onClick={() => onUpload()}
                      disabled={selectedFiles.length === 0 || uploading}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #2563eb",
                        background: "#2563eb",
                        color: "#fff",
                        cursor: selectedFiles.length === 0 || uploading ? "not-allowed" : "pointer",
                        fontWeight: 600,
                      }}
                    >
                      อัพโหลด
                    </button>
                    <button
                      onClick={startZipFromSelected}
                      disabled={zipping}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #999",
                        background: "#fff",
                        cursor: zipping ? "not-allowed" : "pointer",
                        fontWeight: 600,
                      }}
                    >
                      บีบอัดไฟล์ (ZIP)
                    </button>
                  </div>
                  {/* แสดงชื่อไฟล์ที่เลือกใต้ปุ่มอัพโหลด */}
                  {selectedFiles.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 12, color: "#333" }}>
                      เลือกไว้ ({selectedFiles.length} ไฟล์):
                      <ul style={{ listStyle: "initial", paddingLeft: 18, margin: 6, maxHeight: 160, overflowY: "auto" }}>
                        {selectedFiles.map((f, i) => (
                          <li key={`${f.name}-${i}`}>
                            <strong>{f.name}</strong> ({(f.size / (1024 * 1024)).toFixed(2)} MB)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              {/* ตั้งชื่อ ZIP: แสดงเป็น Popup Modal */}
              <ZipNameModal
                visible={zipPendingFiles.length > 0}
                zipName={zipName}
                onChange={(v) => setZipName(v)}
                zipping={zipping}
                filesCount={zipPendingFiles.length}
                onConfirm={() => {
                  if (!zipName.trim()) {
                    emitToast("warning", "กรุณาตั้งชื่อไฟล์ ZIP");
                    return;
                  }
                  zipFilesAndDownload(zipPendingFiles, zipName.trim());
                }}
                onCancel={() => {
                  setZipPendingFiles([]);
                  setZipName("");
                }}
              />
            </div>

            {/* ขวา: รายการไฟล์ที่อัพโหลด + รายละเอียด (40%) */}
            <div style={{ flex: 2 }}>
                {/* สรุปการบีบอัดไฟล์ (ถ้ามี) */}
                {hasDetails && zipSummary && (
                  <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 600 }}>สรุปการบีบอัดไฟล์</div>
                      <div style={{ fontSize: 12, padding: "4px 8px", borderRadius: 999, background: "#f1f5f9", color: "#333" }}>{zipSummary.entries.length} ไฟล์</div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, color: "#444" }}>
                      <div>ชื่อไฟล์: <strong>{zipSummary.name}</strong></div>
                      <div>ขนาดรวมโดยประมาณ: {zipSummary.total ? (zipSummary.total / (1024 * 1024)).toFixed(2) : "-"} MB</div>
                    </div>
                    <ul style={{ listStyle: "initial", paddingLeft: 18, marginTop: 8, maxHeight: 160, overflowY: "auto" }}>
                      {zipSummary.entries.map((e, idx) => (
                        <li key={`${e.name}-${idx}`}>
                          {e.name} {typeof e.size === 'number' ? `(${(e.size/(1024*1024)).toFixed(2)} MB)` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* รายการไฟล์ที่อัพโหลด (แสดงเฉพาะเมื่อมีไฟล์แล้ว) */}
                {uploadedItems.length > 0 && (
                  <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 600 }}>ไฟล์ที่อัพโหลด</div>
                      <div style={{ fontSize: 12, padding: "4px 8px", borderRadius: 999, background: "#f1f5f9", color: "#333" }}>{uploadedItems.length} ไฟล์</div>
                    </div>
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                      {uploadedItems.map((it, idx) => (
                        <div key={`${it.relative}-${idx}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #eee", borderRadius: 8, padding: 10, background: "#fff" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 18 }}>📦</span>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 600 }}>{it.displayName}</div>
                              <div style={{ fontSize: 12, color: "#666" }}>{(it.size / (1024 * 1024)).toFixed(2)} MB • {it.mime || ""}</div>
                              <div style={{ fontSize: 11, color: "#888" }}>{it.uploadedAt}</div>
                            </div>
                          </div>
                          {/* ย้ายปุ่มแตกไฟล์ซ้อนไปอยู่ในหัวข้อรายละเอียดตามคำขอ */}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* หัวข้อรายละเอียด (แสดงทุกไฟล์ที่แตกได้) */}
                {hasDetails && (() => {
                  const uniqueExtracted = Array.from(new Set(extractedFiles));
                  return (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ fontWeight: 600 }}>รายละเอียด</div>
                        <div style={{ fontSize: 12, padding: "4px 8px", borderRadius: 999, background: "#f1f5f9", color: "#333" }}>{uniqueExtracted.length} ไฟล์</div>
                      </div>
                      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                        {uniqueExtracted.length === 0 ? (
                          <div style={{ fontSize: 13, color: "#777" }}>ยังไม่มีรายละเอียดไฟล์ที่แตก</div>
                        ) : uniqueExtracted.map((rel, idx) => {
                          const name = rel.split('/').pop() || rel;
                          const lower = rel.toLowerCase();
                          const isArchive = lower.endsWith('.zip') || lower.endsWith('.rar');
                          return (
                            <div key={`${rel}-detail-${idx}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #eee", borderRadius: 8, padding: 10, background: "#fff" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 18 }}>📄</span>
                                <div>
                                  <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
                                  <div style={{ fontSize: 12, color: "#666" }}>ตำแหน่ง: {rel}</div>
                                </div>
                              </div>
                              {isArchive && (
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <button
                                    title="แตกไฟล์ซ้อน"
                                    onClick={() => extractNestedArchive(rel)}
                                    style={{ padding: "6px 10px", border: "1px solid #999", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                                  >
                                    แตกไฟล์ซ้อน
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* ซ่อนข้อความแจ้งเตือนด้านล่างฝั่งขวา ให้เหลือเฉพาะ Popup (Toast/Modal) */}

                {/* เอาสรุปการแตกไฟล์อัตโนมัติออกตามคำขอ */}

                <PasswordModal
                  pendingFile={pendingPasswordFile}
                  password={manualPassword}
                  message={message}
                  uploading={uploading}
                  onChange={(value) => setManualPassword(value)}
                  onCancel={() => setPendingPasswordFile(null)}
                  onSubmit={() => {
                    if (pendingPasswordFile) {
                      extractWithPassword(
                        pendingPasswordFile,
                        manualPassword,
                        path.dirname(pendingPasswordFile)
                      );
                    }
                  }}
                />

                {/* รายการไฟล์ที่แตกได้ ถูกย้ายไปรวมกับ "ไฟล์ที่อัพโหลด" ด้านบน */}
              </div>
            
          </div>
        );
      })()}
    </main>
  );
}

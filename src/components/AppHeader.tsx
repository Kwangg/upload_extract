"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function AppHeader({ username }: { username: string }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return null;
  }

  useEffect(() => {
    let timer: any;
    const check = async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (res.status === 401) {
          const next = window.location.pathname + window.location.search;
          window.location.href = `/login?next=${encodeURIComponent(next)}`;
        }
      } catch {}
    };
    // ตรวจทุก ๆ 10 นาที เพื่อเด้งทันทีเมื่อ session หมดอายุ
    timer = setInterval(check, 600000);
    // เรียกตรวจทันทีหนึ่งครั้งตอน mount
    check();
    return () => clearInterval(timer);
  }, [pathname]);

  const UserIcon = ({ size = 20, color = '#444' }: { size?: number; color?: string }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6H4z" />
    </svg>
  );

  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #eee', position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
      <a href="/" style={{ fontSize: 16, fontWeight: 600, color: '#222', textDecoration: 'none' }}>ระบบอัพโหลดไฟล์</a>
      <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <details style={{ position: 'relative' }}>
          <summary style={{ listStyle: 'none', cursor: 'pointer' }} aria-label="เมนูผู้ใช้" title="เมนูผู้ใช้">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', border: '1px solid #ddd', borderRadius: 999, background: '#fff' }}>
              <UserIcon size={18} />
            </div>
          </summary>
          <div style={{ position: 'absolute', right: 0, marginTop: 8, border: '1px solid #ddd', borderRadius: 6, background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', minWidth: 200 }}>
            {username && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', color: '#444', borderBottom: '1px solid #f0f0f0' }}>
                <UserIcon size={18} />
                <span style={{ fontWeight: 600 }}>{username}</span>
              </div>
            )}
            <a href="/" style={{ display: 'block', padding: '8px 12px', textDecoration: 'none', color: '#333', borderBottom: '1px solid #f0f0f0' }}>หน้าแรก</a>
            {/* ลบเมนู /zip และ /zip-server ตามคำขอ */}
            <a href="/files" style={{ display: 'block', padding: '8px 12px', textDecoration: 'none', color: '#333' }}>ไฟล์สำรอง (พรีวิว/สรุป)</a>
            {username ? (
              <a href="/api/auth/logout" style={{ display: 'block', padding: '8px 12px', textDecoration: 'none', color: '#d00' }}>ออกจากระบบ</a>
            ) : (
              <a href="/login" style={{ display: 'block', padding: '8px 12px', textDecoration: 'none', color: '#333' }}>เข้าสู่ระบบ</a>
            )}
          </div>
        </details>
      </nav>
    </header>
  );
}
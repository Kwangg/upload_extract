export const metadata = {
  title: "อัพโหลดไฟล์ .zip/.rar",
  description: "ระบบอัพโหลดไฟล์พัฒนาด้วย Next.js",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #eee', position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#222' }}>ระบบอัพโหลดไฟล์</div>
          <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <a href="/" style={{ fontSize: 14, color: '#0070f3', textDecoration: 'none' }}>หน้าแรก</a>
            <details style={{ position: 'relative' }}>
              <summary style={{ listStyle: 'none', cursor: 'pointer', fontSize: 14, color: '#0070f3' }}>เมนู</summary>
              <div style={{ position: 'absolute', right: 0, marginTop: 8, border: '1px solid #ddd', borderRadius: 6, background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', minWidth: 200 }}>
                <a href="/" style={{ display: 'block', padding: '8px 12px', textDecoration: 'none', color: '#333', borderBottom: '1px solid #f0f0f0' }}>หน้าแรก</a>
                <a href="/g23" style={{ display: 'block', padding: '8px 12px', textDecoration: 'none', color: '#333' }}>เปิดไฟล์ .g23/.d23</a>
              </div>
            </details>
          </nav>
        </header>
        <div style={{ padding: '12px 16px' }}>
          {children}
        </div>
      </body>
    </html>
  );
}

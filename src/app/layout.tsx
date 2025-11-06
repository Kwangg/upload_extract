export const metadata = {
  title: "อัพโหลดไฟล์ .zip/.rar",
  description: "ระบบอัพโหลดไฟล์พัฒนาด้วย Next.js",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}

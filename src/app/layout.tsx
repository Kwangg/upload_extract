import ToastGlobal from "../components/Toast";
import { cookies } from "next/headers";
import AppHeader from "../components/AppHeader";

export const metadata = {
  title: "อัพโหลดไฟล์ .zip/.rar",
  description: "ระบบอัพโหลดไฟล์พัฒนาด้วย Next.js",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const session = cookies().get("session")?.value || "";
  const username = session ? session : "";
  return (
    <html lang="th">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <AppHeader username={username} />
        <div style={{ padding: '12px 16px' }}>
          {children}
        </div>
        {/* Global toast notifications */}
        <ToastGlobal />
      </body>
    </html>
  );
}

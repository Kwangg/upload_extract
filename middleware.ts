import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const session = req.cookies.get("session")?.value;

  // ถ้าไม่ได้ล็อกอิน ให้ redirect ทุกหน้าที่ไม่ใช่ /login ไป /login
  if (!session && pathname !== "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // เก็บ path+query เดิมไว้ใน next
    const nextPath = pathname + (req.nextUrl.search || "");
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url);
  }

  // If already logged in, avoid staying on /login
  if (pathname === "/login" && session) {
    const next = searchParams.get("next") || "/";
    const url = req.nextUrl.clone();
    url.pathname = next;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // ล็อกทุกหน้า (รวมหน้าแรก "/") ยกเว้น /login, ไฟล์ภายในของ Next และ API
  matcher: ["/", "/login", "/((?!api|_next|favicon.ico|login).*)"],
};
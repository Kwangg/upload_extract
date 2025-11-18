This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## เชื่อมต่อ MySQL ด้วย mysql2

เพิ่มการเชื่อมต่อฐานข้อมูลและ API ตัวอย่างด้วย `mysql2/promise` เพื่อทดสอบการเชื่อมต่อ:

### ติดตั้งไลบรารี

```
npm i mysql2
```

### ตั้งค่าตัวแปรแวดล้อม (`.env.local`)

```
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=cad_gl
MYSQL_POOL_SIZE=10
# สำหรับข้อมูลภาษาไทยจาก dump เก่า ให้ใช้ tis620
MYSQL_CHARSET=tis620
```

### โมดูลเชื่อมต่อ

- ไฟล์: `src/lib/db.ts` — สร้าง connection pool ด้วย `mysql2/promise` และคงไว้ใน `global` เพื่อหลีกเลี่ยงการสร้างซ้ำในโหมดพัฒนา

### API ทดสอบการเชื่อมต่อ

- เส้นทาง: `GET /api/db/test`
- ไฟล์: `src/app/api/db/test/route.ts`
- ส่งคืนข้อมูลเมตา (ฐานข้อมูลปัจจุบัน/เวลา) และตัวอย่างรายการตาราง

### ทดสอบ

1. ตั้งค่า `.env.local` ตามด้านบน
2. รันเซิร์ฟเวอร์พัฒนา: `npm run dev`
3. เปิด `http://localhost:3000/api/db/test`
4. ตรวจสอบว่าคืนค่า `{ ok: true, ... }` หากผิดพลาดจะได้ `{ ok: false, error: "..." }`

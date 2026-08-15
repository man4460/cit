# all for one — ระบบปฏิบัติการ (CIT / ภารกิจ)

เว็บแอปสำหรับบริหารบุคลากร ยานพาหนะ ครุภัณฑ์ เส้นทาง ภารกิจ เอกสาร และรายงาน — **frontend** (React + Vite) เรียก **backend** (Express + Prisma)

## โครงโปรเจกต์

| โฟลเดอร์ | บทบาท |
|-----------|--------|
| `backend/` | API (`/api/...`), ไฟล์อัปโหลด, Prisma |
| `frontend/` | SPA (พอร์ต 5173 ตอน dev) |

## ความต้องการของระบบ

- **Node.js** แนะนำ v20 LTS (หรือใกล้เคียงที่รองรับ TypeScript 5.8 / Prisma 6)
- npm มากับ Node

## ติดตั้งครั้งแรก

### 1) Backend

ใช้ **MySQL ที่ติดตั้งบนเครื่อง** (พอร์ต 3306):

```bash
cd backend
cp .env.example .env
# แก้ DATABASE_URL เป็น mysql://USER:PASSWORD@127.0.0.1:3306/cit_mission
npm install
npm run db:setup-mysql
npm run bootstrap:admin
```

- `db:setup-mysql` สร้าง database (ถ้ายังไม่มี) แล้ว `prisma db push`
- `bootstrap:admin` สร้างผู้ดูแลคนแรกเมื่อยังไม่มี user และมี `INITIAL_ADMIN_PASSWORD` ใน `.env`

### 2) Frontend

```bash
cd frontend
cp .env.example .env
# ตอน dev มักไม่ต้องตั้ง VITE_API_URL — ใช้ proxy ไปที่ API
npm install
```

## รันแบบพัฒนา (dev)

เปิด **สองเทอร์มินัล**:

**เทอร์มินัล 1 — API**

```bash
cd backend
npm run dev
```

- API ฟังที่ **http://localhost:4000** (หรือ `PORT` ใน `.env`)
- ตรวจสุขภาพ: `GET http://localhost:4000/api/health`

**เทอร์มินัล 2 — เว็บ**

```bash
cd frontend
npm run dev
```

- เปิดเบราว์เซอร์ที่ **http://localhost:5173**
- Vite จะ **proxy** path `/api` และ `/uploads` ไปที่ `http://localhost:4000` (ดู `frontend/vite.config.ts`)

### เปิดจากมือถือใน Wi‑Fi เดียวกัน

- Frontend ตั้ง `server.host: true` แล้ว — เข้า `http://<IP-เครื่อง-PC>:5173`
- ถ้า API อยู่คนละโฮสต์ ให้ตั้ง `VITE_API_URL` ใน `frontend/.env` เป็น URL เต็มของ API (เช่น `http://192.168.1.10:4000`)

## ตัวแปรสภาพแวดล้อม (สรุป)

รายละเอียดเต็มอยู่ใน `backend/.env.example` และ `frontend/.env.example`

| ตัวแปร | ที่ใช้ | หมายเหตุ |
|--------|--------|----------|
| `DATABASE_URL` | backend | MySQL ในเครื่อง เช่น `mysql://root:PASSWORD@127.0.0.1:3306/cit_mission` |
| `PORT`, `HOST` | backend | ค่าเริ่มต้น 4000, `0.0.0.0` |
| `JWT_SECRET` | backend | ตั้งยาวและสุ่มใน production |
| `UPLOAD_DIR` | backend | ที่เก็บไฟล์อัปโหลด (เสิร์ฟที่ `/uploads`) |
| `PUBLIC_BASE_URL` | backend | URL ฐานของ API สำหรับลิงก์สาธารณะ |
| `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` | backend | สร้าง admin ตอนฐานว่าง |
| `VITE_API_URL` | frontend | ว่าง = ใช้ path เดียวกับหน้าเว็บ + proxy (dev) |

## Build สำหรับใช้งานจริง (production)

**Backend**

```bash
cd backend
npx prisma generate
npm run build
npm run start
```

**Frontend**

```bash
cd frontend
# ตั้ง VITE_API_URL ให้ชี้ URL จริงของ API ก่อน build (ถ้าไม่ได้ reverse proxy ร่วมโดเมน)
npm run build
```

ผลลัพธ์อยู่ที่ `frontend/dist/` — นำไปให้เว็บเซิร์ฟเวอร์ (Nginx, IIS, ฯลฯ) serve static และ reverse proxy `/api` ไปที่ Node

## ฐานข้อมูลและสำรองข้อมูล

- **MySQL ในเครื่อง (ค่าเริ่มต้น):** ตั้ง `DATABASE_URL` ใน `backend/.env` แล้วรัน `npm run db:setup-mysql`
- สำรอง: `cd backend && npm run db:backup` (mysqldump → `backend/backups/`)
- ไฟล์อัปโหลด (`uploads/`) สำรองแยกจากฐานข้อมูล และห้ามขึ้น Git
- ข้อมูล/รหัสลับ (`.env`, dump, uploads) **ย้ายนอก Git** ไปยัง server

## สคริปต์อื่นใน backend

- `npm run db:studio` — Prisma Studio
- `npm run bootstrap:admin` — สร้าง/อัปเดต admin ตาม env
- สคริปต์ `seed:*` และ migration เฉพาะทาง — ดูรายการใน `backend/package.json`

## โครงสร้าง API (ย่อ)

- `POST /api/auth/login` — เข้าสู่ระบบ
- `GET /api/me` — ข้อมูลผู้ใช้ (ต้อง Bearer token)
- เส้นทางอื่นภายใต้ `/api/...` — ต้องล็อกอิน (ยกเว้นตามที่กำหนดในโค้ด)

---

พัฒนาโดยใช้ Express, Prisma, React, React Router, Tailwind, Recharts

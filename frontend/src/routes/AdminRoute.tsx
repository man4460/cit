import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** จำกัดเฉพาะ ADMIN — ผู้ใช้ทั่วไปถูกส่งกลับแดชบอร์ด */
export function AdminRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-700">กำลังตรวจสอบสิทธิ์…</div>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canDeleteLevel, canEditLevel, levelForPath, type PermissionLevel } from "./permissions";

/** สิทธิ์ของหน้าปัจจุบัน — ใช้โชว์ปุ่มเพิ่ม/แก้ไข/ลบ ไม่ผูกกับบทบาท ADMIN */
export function usePagePermission(): {
  level: PermissionLevel | null;
  canEdit: boolean;
  canDelete: boolean;
} {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const level = levelForPath(user, pathname);
  return {
    level,
    canEdit: canEditLevel(level),
    canDelete: canDeleteLevel(level),
  };
}

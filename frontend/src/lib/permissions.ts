export const PERMISSION_LEVELS = ["none", "read", "edit", "delete"] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];
export type PermissionMap = Record<string, PermissionLevel>;

export const PERMISSION_LEVEL_LABEL: Record<PermissionLevel, string> = {
  none: "ไม่เห็น",
  read: "อ่าน",
  edit: "แก้ไข",
  delete: "ลบได้",
};

export const PERMISSION_LEVEL_HINT: Record<PermissionLevel, string> = {
  none: "ซ่อนเมนู เข้าหน้านี้ไม่ได้",
  read: "ดูข้อมูลได้อย่างเดียว",
  edit: "ดู เพิ่ม และแก้ไขได้ แต่ลบไม่ได้",
  delete: "ดู เพิ่ม แก้ไข และลบได้",
};

/** key ต้องตรงกับ backend/src/lib/permissions.ts */
export const PERMISSION_MODULES: { key: string; label: string; group: string; routePrefixes: string[]; exact?: string[] }[] = [
  { key: "missions", label: "ภารกิจ เส้นทาง และรายงาน", group: "การปฏิบัติการ", routePrefixes: ["/missions", "/routes", "/reports"], exact: ["/"] },
  { key: "activities", label: "กิจกรรม", group: "การปฏิบัติการ", routePrefixes: ["/activities", "/tasks"] },
  { key: "incidents", label: "เหตุการณ์ไม่ปกติ", group: "การปฏิบัติการ", routePrefixes: ["/security-incidents"] },
  { key: "os", label: "งานจ้าง OS", group: "การปฏิบัติการ", routePrefixes: ["/os-outsourcing"] },
  { key: "investigation", label: "สืบสวนและประมวลข่าว", group: "สืบสวน", routePrefixes: ["/investigation"] },
  { key: "budget", label: "งบประมาณ", group: "งบประมาณ", routePrefixes: ["/budget"] },
  { key: "personnel", label: "บุคลากร", group: "กำลังพล", routePrefixes: ["/personnel"] },
  { key: "training", label: "ทะเบียนการอบรม", group: "กำลังพล", routePrefixes: ["/training"] },
  { key: "vehicles", label: "ยานพาหนะ", group: "ครุภัณฑ์", routePrefixes: ["/vehicles", "/disposition-registry"] },
  { key: "vests", label: "เสื้อเกราะ", group: "ครุภัณฑ์", routePrefixes: ["/vests", "/assets/armor-monthly"] },
  { key: "assets", label: "วิทยุ / ครุภัณฑ์อื่น", group: "ครุภัณฑ์", routePrefixes: ["/radios", "/assets"] },
  { key: "weapons", label: "อาวุธปืนและกระสุน", group: "ครุภัณฑ์", routePrefixes: ["/weapons"] },
  { key: "fire", label: "อัคคีภัย", group: "วัสดุทั่วไป", routePrefixes: ["/fire-safety"] },
  { key: "documents", label: "คลังเอกสาร", group: "คลังเอกสาร", routePrefixes: ["/documents"] },
];

export type PermissionViewer = { role: string; permissions?: PermissionMap | null } | null | undefined;

function pathOnly(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

/** โมดูลของหน้า — ตรงกับ prefix ยาวสุด (เช่น /assets/armor-monthly → เสื้อเกราะ ไม่ใช่ครุภัณฑ์อื่น) */
export function moduleForPath(pathname: string): string | null {
  const path = pathOnly(pathname);
  let best: { key: string; len: number } | null = null;
  for (const m of PERMISSION_MODULES) {
    if (m.exact?.includes(path)) return m.key;
    for (const p of m.routePrefixes)
      if ((path === p || path.startsWith(`${p}/`)) && (!best || p.length > best.len)) best = { key: m.key, len: p.length };
  }
  return best?.key ?? null;
}

export function levelOf(viewer: PermissionViewer, moduleKey: string): PermissionLevel {
  if (!viewer) return "none";
  if (viewer.role === "ADMIN" || viewer.permissions == null) return "delete";
  const v = viewer.permissions[moduleKey];
  return PERMISSION_LEVELS.includes(v) ? v : "none";
}

export function levelForPath(viewer: PermissionViewer, pathname: string): PermissionLevel | null {
  const key = moduleForPath(pathname);
  return key ? levelOf(viewer, key) : null;
}

export function canViewPath(viewer: PermissionViewer, pathname: string): boolean {
  const lv = levelForPath(viewer, pathname);
  return lv == null || lv !== "none";
}

export function fullPermissions(level: PermissionLevel): PermissionMap {
  return Object.fromEntries(PERMISSION_MODULES.map((m) => [m.key, level]));
}

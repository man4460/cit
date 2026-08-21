export type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  adminOnly?: boolean;
  /** เมนูย่อย (แสดงเมื่ออยู่ที่รายการนี้หรือลูก) */
  children?: NavItem[];
};

export type NavGroup = {
  id: string;
  titleTh: string;
  titleEn: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    id: "overview",
    titleTh: "สรุปภาพรวม",
    titleEn: "Overview",
    items: [
      { to: "/", label: "ขนส่งธนบัตร", end: true },
      { to: "/security-incidents/dashboard", label: "เหตุการณ์ไม่ปกติ", end: true },
      {
        to: "/budget/overview/2569",
        label: "งบประมาณ",
        children: [
          { to: "/budget/overview/2568", label: "ปี 2568", end: true },
          { to: "/budget/overview/2569", label: "ปี 2569", end: true },
          { to: "/budget/overview/2570", label: "ปี 2570", end: true },
        ],
      },
    ],
  },
  {
    id: "ops",
    titleTh: "การปฏิบัติการ",
    titleEn: "Operations & Missions",
    items: [
      {
        to: "/missions",
        label: "ภารกิจ",
        children: [
          { to: "/routes", label: "เส้นทางภารกิจ" },
        ],
      },
      { to: "/activities", label: "กิจกรรม" },
      {
        to: "/reports",
        label: "รายงาน",
        end: true,
        children: [
          { to: "/vehicles/weekly-inspection", label: "ตรวจรถประจำสัปดาห์" },
          { to: "/assets/armor-monthly", label: "ตรวจเสื้อเกราะรายเดือน" },
        ],
      },
      { to: "/security-incidents", label: "เหตุการณ์ไม่ปกติ" },
      { to: "/os-outsourcing", label: "งานจ้าง OS" },
    ],
  },
  {
    id: "investigation",
    titleTh: "สืบสวนและประมวลข่าว",
    titleEn: "Investigation & Intelligence",
    items: [
      { to: "/investigation", label: "แดชบอร์ด", end: true },
      { to: "/investigation/cases", label: "ทะเบียนคดี" },
      { to: "/investigation/approvals", label: "รออนุมัติ" },
      { to: "/investigation/teams", label: "ทีมสืบสวน" },
    ],
  },
  {
    id: "budget",
    titleTh: "งบประมาณ",
    titleEn: "Budget",
    items: [
      { to: "/budget/year/2568", label: "ปี 2568" },
      { to: "/budget/year/2569", label: "ปี 2569" },
      { to: "/budget/year/2570", label: "ปี 2570" },
    ],
  },
  {
    id: "personnel",
    titleTh: "กำลังพล",
    titleEn: "Personnel Management",
    items: [
      { to: "/personnel", label: "บุคลากร" },
      { to: "/training", label: "ทะเบียนการอบรม" },
    ],
  },
  {
    id: "equipment",
    titleTh: "ครุภัณฑ์",
    titleEn: "Equipment",
    items: [
      { to: "/vehicles", label: "ยานพาหนะ", end: true },
      { to: "/vests", label: "เสื้อเกราะ" },
      { to: "/radios", label: "วิทยุ" },
      { to: "/weapons", label: "อาวุธปืนและกระสุน" },
    ],
  },
  {
    id: "materials",
    titleTh: "วัสดุทั่วไป",
    titleEn: "General Materials",
    items: [{ to: "/fire-safety", label: "อัคคีภัย", end: true }],
  },
  {
    id: "documents",
    titleTh: "คลังเอกสาร",
    titleEn: "Document Library",
    items: [{ to: "/documents", label: "คลังเอกสาร", end: true }],
  },
  {
    id: "admin",
    titleTh: "ผู้ดูแลระบบ",
    titleEn: "Administration",
    items: [
      { to: "/admin", label: "จัดการผู้ใช้", end: true, adminOnly: true },
      { to: "/audit-trail", label: "ความเคลื่อนไหว", adminOnly: true },
      { to: "/scan", label: "สแกน QR", adminOnly: true },
    ],
  },
];

function pathOnly(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

function selfMatchesPath(pathname: string, item: NavItem): boolean {
  const path = pathOnly(pathname);
  if (item.to === "/budget/overview/2569" || item.to.startsWith("/budget/overview/")) {
    if (item.to === "/budget/overview/2569" && !item.end && item.children?.length) {
      return path === "/budget" || path.startsWith("/budget/overview/");
    }
    if (item.end) return path === item.to;
    return path === item.to || path.startsWith(`${item.to}/`);
  }
  if (item.to === "/budget" && item.end) {
    return path === "/budget";
  }
  if (item.to === "/reports" && item.end) {
    return path === "/reports" || path.startsWith("/reports/");
  }
  if (item.to === "/vehicles" && item.end) {
    return (
      path === "/vehicles" ||
      (path.startsWith("/vehicles/") && !path.startsWith("/vehicles/weekly-inspection"))
    );
  }
  if (item.to === "/assets" && item.end) {
    return path === "/assets" || (path.startsWith("/assets/") && !path.startsWith("/assets/armor-monthly"));
  }
  if (item.end) return path === item.to;
  return path === item.to || path.startsWith(`${item.to}/`);
}

export function itemMatchesPath(pathname: string, item: NavItem): boolean {
  if (selfMatchesPath(pathname, item)) return true;
  return Boolean(item.children?.some((c) => itemMatchesPath(pathname, c)));
}

/** จับคู่เฉพาะตัวรายการเอง (ไม่นับลูก) — ใช้ไฮไลต์แท็บหลัก */
export function itemSelfMatchesPath(pathname: string, item: NavItem): boolean {
  return selfMatchesPath(pathname, item);
}

export function findGroupForPath(pathname: string, role?: string): NavGroup | null {
  const path = pathOnly(pathname);
  // งบประมาณ: ปีใดก็ได้ (ไม่รวม /budget/overview ที่อยู่ในสรุปภาพรวม)
  if (/^\/budget\/year\/\d+(\/|$)/.test(path)) {
    return navGroups.find((g) => g.id === "budget") ?? null;
  }
  for (const group of navGroups) {
    const items = group.items.filter((it) => !it.adminOnly || role === "ADMIN");
    if (items.some((it) => itemMatchesPath(pathname, it))) return group;
  }
  return null;
}

export function filterGroupItems(group: NavGroup, role?: string): NavItem[] {
  return group.items.filter((it) => !it.adminOnly || role === "ADMIN");
}

const LAST_PATH_PREFIX = "afo_nav_last_";

export function readGroupLastPath(groupId: string): string | null {
  try {
    return sessionStorage.getItem(`${LAST_PATH_PREFIX}${groupId}`);
  } catch {
    return null;
  }
}

export function writeGroupLastPath(groupId: string, path: string) {
  try {
    sessionStorage.setItem(`${LAST_PATH_PREFIX}${groupId}`, path);
  } catch {
    /* ignore */
  }
}

/** เส้นทางที่จะไปเมื่อกดหมวด — จำหน้าล่าสุดในหมวดนั้น ถ้ายังใช้ได้ */
export function resolveGroupEntryPath(group: NavGroup, role?: string): string {
  const items = filterGroupItems(group, role);
  if (!items.length) return "/";
  const last = readGroupLastPath(group.id);
  if (last && items.some((it) => itemMatchesPath(last, it))) return last;
  return items[0].to;
}

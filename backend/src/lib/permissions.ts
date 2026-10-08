import type { Prisma } from "@prisma/client";

export const PERMISSION_LEVELS = ["none", "read", "edit", "delete"] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];
export type PermissionMap = Record<string, PermissionLevel>;

/** ต้องตรงกับ frontend/src/lib/permissions.ts (key เดียวกัน) */
export const PERMISSION_MODULES: { key: string; apiPrefixes: string[] }[] = [
  {
    key: "missions",
    apiPrefixes: [
      "/missions",
      "/mission-estimates",
      "/mission-evaluations",
      "/route-master",
      "/mission-personnel-roles",
      "/mission-vehicle-roles",
      "/mission-expense-types",
      "/police-stations",
    ],
  },
  { key: "activities", apiPrefixes: ["/tasks", "/activity-categories"] },
  { key: "incidents", apiPrefixes: ["/security-incidents"] },
  { key: "os", apiPrefixes: ["/os-outsourcing"] },
  { key: "investigation", apiPrefixes: ["/investigation"] },
  { key: "budget", apiPrefixes: ["/budget"] },
  { key: "personnel", apiPrefixes: ["/personnel", "/personnel-categories", "/organization-unit-types"] },
  { key: "training", apiPrefixes: ["/training-courses", "/training-enrollments"] },
  { key: "vehicles", apiPrefixes: ["/vehicles", "/vehicle-types", "/work-category-groups", "/vehicle-statuses"] },
  { key: "vests", apiPrefixes: ["/bulletproof-vests", "/armor-inspections"] },
  { key: "assets", apiPrefixes: ["/assets", "/asset-categories", "/asset-routines", "/asset-affiliations", "/asset-item-statuses"] },
  { key: "weapons", apiPrefixes: ["/firearms", "/ammunition"] },
  { key: "fire", apiPrefixes: ["/fire-extinguishers", "/fire-hosts"] },
  { key: "documents", apiPrefixes: ["/library-documents", "/document-types"] },
];

const MODULE_KEYS = new Set(PERMISSION_MODULES.map((m) => m.key));

export function moduleForApiPath(path: string): string | null {
  for (const m of PERMISSION_MODULES)
    if (m.apiPrefixes.some((p) => path === p || path.startsWith(`${p}/`))) return m.key;
  return null;
}

export function levelRank(level: PermissionLevel): number {
  return PERMISSION_LEVELS.indexOf(level);
}

/** null/undefined = ไม่จำกัด (ผู้ใช้เดิมก่อนมีระบบสิทธิ์) — โมดูลที่ไม่ได้ระบุถือว่า none */
export function levelFor(permissions: unknown, moduleKey: string): PermissionLevel {
  if (permissions == null || typeof permissions !== "object") return "delete";
  const v = (permissions as Record<string, unknown>)[moduleKey];
  return PERMISSION_LEVELS.includes(v as PermissionLevel) ? (v as PermissionLevel) : "none";
}

/** รับค่าจาก request: null = ไม่จำกัด, object = เก็บเฉพาะ key/level ที่ถูกต้อง */
export function parsePermissions(input: unknown): { ok: true; value: Prisma.InputJsonValue | null } | { ok: false; error: string } {
  if (input === null) return { ok: true, value: null };
  if (typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "permissions ไม่ถูกต้อง" };
  const out: PermissionMap = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!MODULE_KEYS.has(k)) continue;
    if (!PERMISSION_LEVELS.includes(v as PermissionLevel)) return { ok: false, error: `ระดับสิทธิ์ของ ${k} ไม่ถูกต้อง` };
    out[k] = v as PermissionLevel;
  }
  return { ok: true, value: out };
}

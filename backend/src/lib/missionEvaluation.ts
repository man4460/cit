import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";

/** หัวข้อประเมิน — แก้ที่นี่ที่เดียว (หน้าแบบประเมินและรายงานดึงจาก API) */
export const EVALUATION_CATEGORIES = [
  {
    key: "accommodation",
    label: "ด้านที่พัก",
    description: "ความสะอาด ความปลอดภัย และความสะดวกของที่พัก",
    tags: [
      "ความสะอาดห้องพัก",
      "ความปลอดภัย",
      "ทำเลที่ตั้ง / การเดินทาง",
      "เครื่องปรับอากาศ / น้ำอุ่น",
      "ที่นอน / เครื่องนอน",
      "อินเทอร์เน็ต / Wi-Fi",
      "ที่จอดรถ",
      "เสียงรบกวน",
    ],
  },
  {
    key: "food",
    label: "ด้านอาหาร",
    description: "รสชาติ ความสะอาด ปริมาณ และความตรงเวลาของมื้ออาหาร",
    tags: [
      "รสชาติ",
      "ความสะอาด / สุขอนามัย",
      "ปริมาณไม่เพียงพอ",
      "ความหลากหลายของเมนู",
      "ความตรงเวลา",
      "น้ำดื่ม / เครื่องดื่ม",
      "อาหารสำหรับผู้มีข้อจำกัด",
    ],
  },
  {
    key: "vehicle",
    label: "ด้านยานพาหนะและอุปกรณ์",
    description: "สภาพรถ ความปลอดภัย และความพร้อมของอุปกรณ์ปฏิบัติงาน",
    tags: [
      "สภาพรถ / เครื่องยนต์",
      "ความสะอาดภายในรถ",
      "เครื่องปรับอากาศในรถ",
      "อุปกรณ์ความปลอดภัยในรถ",
      "วิทยุสื่อสาร",
      "เสื้อเกราะ / อุปกรณ์ป้องกัน",
      "อุปกรณ์ไม่เพียงพอ",
      "การบำรุงรักษาก่อนออกเดินทาง",
    ],
  },
] as const;

export type EvaluationCategoryKey = (typeof EVALUATION_CATEGORIES)[number]["key"];

export const RATING_LABELS: Record<number, string> = {
  1: "ต้องปรับปรุงเร่งด่วน",
  2: "ต้องปรับปรุง",
  3: "พอใช้",
  4: "ดี",
  5: "ดีมาก",
};

export type CategoryAnswer = { rating: number | null; tags: string[]; comment: string };
export type EvaluationAnswers = Record<string, CategoryAnswer>;

const MAX_COMMENT = 1000;

export function newEvaluationToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function clampRating(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

function cleanText(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_COMMENT) : "";
}

/** รับเฉพาะหัวข้อ/แท็กที่กำหนด — rating null = ไม่ได้ใช้บริการด้านนั้น */
export function sanitizeAnswers(raw: unknown): EvaluationAnswers {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: EvaluationAnswers = {};
  for (const cat of EVALUATION_CATEGORIES) {
    const a = src[cat.key] && typeof src[cat.key] === "object" ? (src[cat.key] as Record<string, unknown>) : {};
    const allowed = new Set<string>(cat.tags);
    const tags = Array.isArray(a.tags) ? [...new Set(a.tags.filter((t): t is string => typeof t === "string" && allowed.has(t)))] : [];
    out[cat.key] = { rating: clampRating(a.rating), tags, comment: cleanText(a.comment) };
  }
  return out;
}

export function sanitizeOverall(v: unknown): number | null {
  return clampRating(v);
}

export function sanitizeOtherComment(v: unknown): string | null {
  return cleanText(v) || null;
}

export function parseStoredAnswers(json: Prisma.JsonValue): EvaluationAnswers {
  return sanitizeAnswers(json);
}

/** ลิงก์รับคำตอบอยู่หรือไม่ (ปิดเอง / เลยกำหนด / ภารกิจถูกยกเลิก) */
export function linkIsAccepting(
  link: { isOpen: boolean; closesAt: Date | null },
  missionStatus: string,
): boolean {
  if (!link.isOpen) return false;
  if (missionStatus === "CANCELLED") return false;
  if (link.closesAt && link.closesAt.getTime() <= Date.now()) return false;
  return true;
}

export function personnelDisplayName(p: { rank: string | null; fullName: string }): string {
  return [p.rank?.trim(), p.fullName.trim()].filter(Boolean).join(" ");
}

type ResponseRow = {
  answers: Prisma.JsonValue;
  overallRating: number | null;
  otherComment: string | null;
  submittedAt: Date;
  updatedAt: Date;
};

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100;
}

function distribution(nums: number[]): number[] {
  const d = [0, 0, 0, 0, 0];
  for (const n of nums) d[n - 1] += 1;
  return d;
}

/** สรุปผล — ไม่มีข้อมูลระบุตัวผู้ตอบ */
export function summarizeEvaluation(responses: ResponseRow[], crewCount: number) {
  const parsed = responses.map((r) => ({ ...r, a: parseStoredAnswers(r.answers) }));
  const overallNums = parsed.map((r) => r.overallRating).filter((n): n is number => n != null);

  const categories = EVALUATION_CATEGORIES.map((cat) => {
    const ratings: number[] = [];
    const tagCount = new Map<string, number>();
    const comments: { text: string; rating: number | null; at: string }[] = [];
    let naCount = 0;
    for (const r of parsed) {
      const ans = r.a[cat.key];
      if (ans.rating == null) naCount += 1;
      else ratings.push(ans.rating);
      for (const t of ans.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
      if (ans.comment) comments.push({ text: ans.comment, rating: ans.rating, at: r.updatedAt.toISOString() });
    }
    comments.sort((x, y) => (x.rating ?? 6) - (y.rating ?? 6) || y.at.localeCompare(x.at));
    return {
      key: cat.key,
      label: cat.label,
      average: avg(ratings),
      ratedCount: ratings.length,
      naCount,
      distribution: distribution(ratings),
      tags: [...tagCount.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
      comments,
    };
  });

  const otherComments = parsed
    .filter((r) => r.otherComment)
    .map((r) => ({ text: r.otherComment!, at: r.updatedAt.toISOString() }))
    .sort((a, b) => b.at.localeCompare(a.at));

  const responseCount = responses.length;
  return {
    responseCount,
    crewCount,
    responseRate: crewCount ? Math.round((responseCount / crewCount) * 1000) / 10 : 0,
    overall: { average: avg(overallNums), distribution: distribution(overallNums) },
    categories,
    otherComments,
    lastSubmittedAt: responses.length
      ? new Date(Math.max(...responses.map((r) => r.updatedAt.getTime()))).toISOString()
      : null,
  };
}

export function publicCategoryConfig() {
  return EVALUATION_CATEGORIES.map((c) => ({ key: c.key, label: c.label, description: c.description, tags: [...c.tags] }));
}

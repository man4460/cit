export type EvaluationCategory = { key: string; label: string; description: string; tags: string[] };

export type CategoryAnswer = { rating: number | null; tags: string[]; comment: string };
export type EvaluationAnswers = Record<string, CategoryAnswer>;

export type EvaluationLinkInfo = {
  token: string;
  isOpen: boolean;
  closesAt: string | null;
  createdAt: string;
  accepting: boolean;
};

export type EvaluationCategorySummary = {
  key: string;
  label: string;
  average: number | null;
  ratedCount: number;
  naCount: number;
  distribution: number[];
  tags: { tag: string; count: number }[];
  comments: { text: string; rating: number | null; at: string }[];
};

export type EvaluationSummary = {
  responseCount: number;
  crewCount: number;
  responseRate: number;
  overall: { average: number | null; distribution: number[] };
  categories: EvaluationCategorySummary[];
  otherComments: { text: string; at: string }[];
  lastSubmittedAt: string | null;
};

export type EvaluationDetail = {
  mission: {
    id: string;
    code: string | null;
    title: string | null;
    status: string;
    plannedStart: string | null;
    plannedEnd: string | null;
    routeName: string | null;
  };
  link: EvaluationLinkInfo | null;
  categories: EvaluationCategory[];
  ratingLabels: Record<string, string>;
  summary: EvaluationSummary;
  respondents: { name: string; role: string | null; responded: boolean; respondedAt: string | null }[];
};

export const DEFAULT_RATING_LABELS: Record<string, string> = {
  "1": "ต้องปรับปรุงเร่งด่วน",
  "2": "ต้องปรับปรุง",
  "3": "พอใช้",
  "4": "ดี",
  "5": "ดีมาก",
};

export function evaluationUrl(token: string): string {
  const raw = import.meta.env.VITE_PUBLIC_ORIGIN?.trim();
  const origin = (raw || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  return `${origin}/evaluate/${encodeURIComponent(token)}`;
}

/** สีตามระดับคะแนน (เต็ม 5) */
export function scoreTone(avg: number | null): { text: string; bg: string; bar: string; label: string } {
  if (avg == null) return { text: "text-slate-400", bg: "bg-slate-100", bar: "bg-slate-300", label: "ยังไม่มีข้อมูล" };
  if (avg >= 4.5) return { text: "text-emerald-700", bg: "bg-emerald-50", bar: "bg-emerald-500", label: "ดีมาก" };
  if (avg >= 3.5) return { text: "text-teal-700", bg: "bg-teal-50", bar: "bg-teal-500", label: "ดี" };
  if (avg >= 2.5) return { text: "text-amber-700", bg: "bg-amber-50", bar: "bg-amber-500", label: "พอใช้" };
  return { text: "text-rose-700", bg: "bg-rose-50", bar: "bg-rose-500", label: "ต้องปรับปรุง" };
}

export function formatScore(avg: number | null): string {
  return avg == null ? "—" : avg.toFixed(2);
}

export function formatThaiDate(iso: string | null, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function formatThaiDateRange(start: string | null, end: string | null): string {
  if (!start) return "—";
  const s = formatThaiDate(start);
  if (!end) return s;
  const e = formatThaiDate(end);
  return s === e ? s : `${s} – ${e}`;
}

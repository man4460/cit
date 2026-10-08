import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  DEFAULT_RATING_LABELS,
  formatThaiDateRange,
  type EvaluationAnswers,
  type EvaluationCategory,
} from "../lib/missionEvaluation";

type PublicInfo = {
  mission: { code: string | null; title: string | null; routeName: string | null; plannedStart: string | null; plannedEnd: string | null };
  accepting: boolean;
  closesAt: string | null;
  crew: { personnelId: string; name: string; group: string; role: string | null; responded: boolean }[];
  categories: EvaluationCategory[];
  ratingLabels: Record<string, string>;
};

type VerifyResult = {
  ok: true;
  response: { answers: EvaluationAnswers; overallRating: number | null; otherComment: string; updatedAt: string } | null;
};

type Step = "loading" | "invalid" | "identify" | "form" | "done";

function apiUrl(path: string) {
  const base = import.meta.env.VITE_API_URL ?? "";
  return `${base}${path}`.replace(/([^:]\/)\/+/g, "$1");
}

/** หน้านี้เปิดจาก QR โดยไม่ล็อกอิน — ไม่ใช้ apiJson เพราะแนบโทเคนผู้ใช้และล้างเซสชันเมื่อ 401 */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "เกิดข้อผิดพลาด กรุณาลองใหม่");
  return data as T;
}

function emptyAnswers(categories: EvaluationCategory[]): EvaluationAnswers {
  return Object.fromEntries(categories.map((c) => [c.key, { rating: null, tags: [], comment: "" }]));
}

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] text-slate-900 shadow-sm outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20";

function Svg({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      {children}
    </svg>
  );
}

function CategoryIcon({ k }: { k: string }) {
  if (k === "accommodation")
    return (
      <Svg>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 18V7m0 7h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
      </Svg>
    );
  if (k === "food")
    return (
      <Svg>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 3v8m-3-8v5a3 3 0 0 0 6 0V3M7 11v10m10-18c-1.7 0-3 2.2-3 5v5h3m0-10v18" />
      </Svg>
    );
  if (k === "vehicle")
    return (
      <Svg>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16V8a1 1 0 0 1 1-1h10v9M14 10h4l3 3v3h-7M7.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
      </Svg>
    );
  return (
    <Svg>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m-9 6 2.5-3H19a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14z" />
    </Svg>
  );
}

const CATEGORY_TONES: Record<string, string> = {
  accommodation: "from-sky-500 to-cyan-400",
  food: "from-amber-500 to-orange-400",
  vehicle: "from-[#0000BF] to-[#8b5cf6]",
  overall: "from-emerald-500 to-teal-400",
  other: "from-pink-500 to-fuchsia-400",
};

function StarRating({
  value,
  onChange,
  labels,
  disabled,
  name,
}: {
  value: number | null;
  onChange: (v: number) => void;
  labels: Record<string, string>;
  disabled?: boolean;
  name: string;
}) {
  return (
    <div className={disabled ? "pointer-events-none opacity-40" : ""}>
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label={name}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value != null && n <= value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} คะแนน — ${labels[String(n)]}`}
              onClick={() => onChange(n)}
              className="rounded-lg p-1 transition active:scale-90"
            >
              <svg viewBox="0 0 24 24" className={`h-9 w-9 ${active ? "text-amber-400" : "text-slate-200"}`} fill="currentColor" aria-hidden>
                <path d="M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.13l-5.62 2.97 1.07-6.27L2.9 9.4l6.3-.9L12 2.8z" />
              </svg>
            </button>
          );
        })}
      </div>
      <p className={`mt-1 text-xs font-semibold ${value == null ? "text-slate-400" : value <= 2 ? "text-rose-600" : value === 3 ? "text-amber-600" : "text-emerald-600"}`}>
        {value == null ? "แตะดาวเพื่อให้คะแนน" : `${value}/5 · ${labels[String(value)]}`}
      </p>
    </div>
  );
}

function SectionCard({ tone, icon, title, subtitle, children }: { tone: string; icon: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${tone}`}>
          <CategoryIcon k={icon} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-black text-[#1e1b4b]">{title}</h2>
          {subtitle ? <p className="text-[12px] text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function MissionEvaluationFormPage() {
  const { token = "" } = useParams();
  const [step, setStep] = useState<Step>("loading");
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState("");
  const [personnelId, setPersonnelId] = useState("");
  const [idLast4, setIdLast4] = useState("");
  const [answers, setAnswers] = useState<EvaluationAnswers>({});
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [otherComment, setOtherComment] = useState("");
  const [isEdit, setIsEdit] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [naKeys, setNaKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    call<PublicInfo>(`/api/mission-evaluation-public/${encodeURIComponent(token)}`)
      .then((d) => {
        if (cancelled) return;
        setInfo(d);
        setAnswers(emptyAnswers(d.categories));
        setStep("identify");
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "ไม่พบแบบประเมิน");
        setStep("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of info?.crew ?? []) counts.set(c.group, (counts.get(c.group) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => (a.name === "อื่นๆ" ? 1 : b.name === "อื่นๆ" ? -1 : b.count - a.count));
  }, [info]);

  useEffect(() => {
    if (groups.length === 1) setGroup(groups[0].name);
  }, [groups]);

  const crewInGroup = useMemo(() => (info?.crew ?? []).filter((c) => c.group === group), [info, group]);

  const labels = info?.ratingLabels ?? DEFAULT_RATING_LABELS;
  const categories = info?.categories ?? [];

  const doneCount = useMemo(() => {
    const cats = categories.filter((c) => answers[c.key]?.rating != null || naKeys.has(c.key)).length;
    return cats + (overallRating != null ? 1 : 0);
  }, [categories, answers, naKeys, overallRating]);
  const totalSteps = categories.length + 1;

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!info) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await call<VerifyResult>(`/api/mission-evaluation-public/${encodeURIComponent(token)}/verify`, {
        method: "POST",
        body: JSON.stringify({ personnelId, idLast4 }),
      });
      if (r.response) {
        const base = emptyAnswers(info.categories);
        const merged = { ...base, ...r.response.answers };
        setAnswers(merged);
        setNaKeys(new Set(info.categories.filter((c) => merged[c.key]?.rating == null).map((c) => c.key)));
        setOverallRating(r.response.overallRating);
        setOtherComment(r.response.otherComment ?? "");
        setIsEdit(true);
      } else {
        setAnswers(emptyAnswers(info.categories));
        setNaKeys(new Set());
        setOverallRating(null);
        setOtherComment("");
        setIsEdit(false);
      }
      setShowErrors(false);
      setStep("form");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ยืนยันตัวตนไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function patchAnswer(key: string, patch: Partial<EvaluationAnswers[string]>) {
    setAnswers((cur) => ({ ...cur, [key]: { ...cur[key], ...patch } }));
  }

  function toggleTag(key: string, tag: string) {
    const cur = answers[key]?.tags ?? [];
    patchAnswer(key, { tags: cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag] });
  }

  function toggleNa(key: string) {
    setNaKeys((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else {
        next.add(key);
        patchAnswer(key, { rating: null, tags: [] });
      }
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const missing = categories.filter((c) => answers[c.key]?.rating == null && !naKeys.has(c.key));
    if (missing.length || overallRating == null) {
      setShowErrors(true);
      setErr(
        missing.length
          ? `กรุณาให้คะแนน ${missing.map((c) => c.label).join(", ")} (หรือเลือก «ไม่ได้ใช้บริการ»)`
          : "กรุณาให้คะแนนความพึงพอใจโดยรวม",
      );
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await call(`/api/mission-evaluation-public/${encodeURIComponent(token)}/submit`, {
        method: "POST",
        body: JSON.stringify({ personnelId, idLast4, answers, overallRating, otherComment }),
      });
      setStep("done");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ส่งแบบประเมินไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const missionTitle = info ? info.mission.title || info.mission.code || "ภารกิจ" : "";
  const selectedName = info?.crew.find((c) => c.personnelId === personnelId)?.name ?? "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#eef0ff] via-[#f7f5ff] to-white pb-16">
      <header className="bg-gradient-to-br from-[#0000BF] via-[#5b3fd6] to-[#8b5cf6] px-4 pb-10 pt-8 text-white">
        <div className="mx-auto max-w-xl">
          <div className="mb-4 inline-flex rounded-2xl bg-white px-4 py-2.5 shadow-lg shadow-black/10">
            <img src="/logo-login.png" alt="ALL FOR ONE" draggable={false} decoding="async" className="h-7 w-auto object-contain sm:h-8" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">Mission Feedback</p>
          <h1 className="mt-1 text-2xl font-black leading-tight">แบบประเมินภารกิจ</h1>
          {info ? (
            <div className="mt-3 space-y-0.5 text-[13px] text-white/90">
              <p className="font-bold">
                {missionTitle}
                {info.mission.code && info.mission.title ? <span className="ml-1.5 font-mono text-[11px] text-white/70">{info.mission.code}</span> : null}
              </p>
              {info.mission.routeName ? <p>เส้นทาง {info.mission.routeName}</p> : null}
              <p>{formatThaiDateRange(info.mission.plannedStart, info.mission.plannedEnd)}</p>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto -mt-6 max-w-xl space-y-4 px-4">
        {step === "loading" ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">กำลังโหลดแบบประเมิน…</div>
        ) : null}

        {step === "invalid" ? (
          <div className="rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
            <p className="text-base font-bold text-rose-700">ไม่สามารถเปิดแบบประเมินได้</p>
            <p className="mt-1 text-sm text-slate-600">{err}</p>
          </div>
        ) : null}

        {step === "identify" && info ? (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-[13px] leading-relaxed text-slate-600 shadow-sm">
              <p className="font-bold text-[#1e1b4b]">วัตถุประสงค์</p>
              <p className="mt-1">
                รวบรวมความคิดเห็นของผู้ร่วมภารกิจ เพื่อนำไปปรับปรุง <b>ด้านที่พัก</b> <b>ด้านอาหาร</b> และ <b>ด้านยานพาหนะและอุปกรณ์</b> ในภารกิจครั้งถัดไป
              </p>
              <ul className="mt-2 space-y-1 text-[12px] text-slate-500">
                <li>• ใช้เวลาประมาณ 2 นาที</li>
                <li>• ผลประเมินรายงานแบบ <b className="text-slate-700">ไม่ระบุตัวตน</b> — ผู้จัดภารกิจเห็นเพียงว่าใครตอบแล้ว ไม่เห็นว่าใครตอบอะไร</li>
                <li>• ยืนยันตัวตนเพื่อป้องกันการตอบซ้ำ และแก้ไขคำตอบได้จนกว่าจะปิดรับ</li>
              </ul>
            </div>

            {!info.accepting ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center shadow-sm">
                <p className="font-bold text-amber-800">แบบประเมินนี้ปิดรับคำตอบแล้ว</p>
                <p className="mt-1 text-sm text-amber-700">ขอบคุณที่ให้ความสนใจ</p>
              </div>
            ) : info.crew.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-600 shadow-sm">
                ภารกิจนี้ยังไม่มีรายชื่อบุคลากร — โปรดติดต่อผู้จัดภารกิจ
              </div>
            ) : (
              <form onSubmit={verify} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-black text-[#1e1b4b]">ยืนยันตัวตนผู้ร่วมภารกิจ</p>
                <div>
                  <span className="text-xs font-semibold text-slate-600">
                    กลุ่ม / สังกัด <span className="text-rose-500">*</span>
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="กลุ่ม / สังกัด">
                    {groups.map((g) => {
                      const on = group === g.name;
                      return (
                        <button
                          key={g.name}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => {
                            setGroup(g.name);
                            setPersonnelId("");
                          }}
                          className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${
                            on
                              ? "border-[#0000BF] bg-[#0000BF] text-white shadow-sm"
                              : "border-slate-200 bg-white text-slate-700 hover:border-[#0000BF]/40"
                          }`}
                        >
                          {g.name}
                          <span className={`ml-1.5 text-[11px] font-normal ${on ? "text-white/80" : "text-slate-400"}`}>{g.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">
                    ชื่อของท่าน <span className="text-rose-500">*</span>
                  </span>
                  <select
                    className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
                    value={personnelId}
                    onChange={(e) => setPersonnelId(e.target.value)}
                    disabled={!group}
                    required
                  >
                    <option value="">{group ? `— เลือกชื่อ (${crewInGroup.length} คน) —` : "— เลือกกลุ่มก่อน —"}</option>
                    {crewInGroup.map((c) => (
                      <option key={c.personnelId} value={c.personnelId}>
                        {c.name}
                        {c.role ? ` (${c.role})` : ""}
                        {c.responded ? " · ประเมินแล้ว" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">
                    เลขบัตรประชาชน 4 หลักท้าย <span className="text-rose-500">*</span>
                  </span>
                  <input
                    className={`${inputClass} tracking-[0.5em]`}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    placeholder="เช่น 1234"
                    value={idLast4}
                    onChange={(e) => setIdLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    required
                  />
                </label>
                {err ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p> : null}
                <button
                  type="submit"
                  disabled={busy || !personnelId || idLast4.length !== 4}
                  className="w-full rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-3 text-[15px] font-bold text-white shadow-lg shadow-fuchsia-500/25 disabled:opacity-50"
                >
                  {busy ? "กำลังตรวจสอบ…" : "เริ่มทำแบบประเมิน"}
                </button>
              </form>
            )}
          </>
        ) : null}

        {step === "form" && info ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="sticky top-0 z-10 -mx-4 bg-[#f7f5ff]/95 px-4 py-2 backdrop-blur">
              <div className="flex items-center justify-between text-[12px] font-semibold text-slate-600">
                <span className="truncate">{selectedName}{isEdit ? " · แก้ไขคำตอบเดิม" : ""}</span>
                <span className="shrink-0 tabular-nums">
                  {doneCount}/{totalSteps} หัวข้อ
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0000BF] to-[#8b5cf6] transition-all"
                  style={{ width: `${(doneCount / totalSteps) * 100}%` }}
                />
              </div>
            </div>

            {categories.map((cat) => {
              const ans = answers[cat.key] ?? { rating: null, tags: [], comment: "" };
              const na = naKeys.has(cat.key);
              const invalid = showErrors && ans.rating == null && !na;
              return (
                <div key={cat.key} className={invalid ? "rounded-2xl ring-2 ring-rose-300" : ""}>
                  <SectionCard tone={CATEGORY_TONES[cat.key] ?? CATEGORY_TONES.vehicle} icon={cat.key} title={cat.label} subtitle={cat.description}>
                    <StarRating
                      name={cat.label}
                      value={ans.rating}
                      labels={labels}
                      disabled={na}
                      onChange={(v) => patchAnswer(cat.key, { rating: v })}
                    />
                    <label className="flex w-fit cursor-pointer items-center gap-2 text-[12px] text-slate-500">
                      <input type="checkbox" className="rounded border-slate-300" checked={na} onChange={() => toggleNa(cat.key)} />
                      ไม่ได้ใช้บริการด้านนี้ในภารกิจนี้
                    </label>
                    {!na ? (
                      <div>
                        <p className="text-xs font-semibold text-slate-600">จุดที่ควรปรับปรุง <span className="font-normal text-slate-400">(เลือกได้หลายข้อ)</span></p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {cat.tags.map((tag) => {
                            const on = ans.tags.includes(tag);
                            return (
                              <button
                                key={tag}
                                type="button"
                                aria-pressed={on}
                                onClick={() => toggleTag(cat.key, tag)}
                                className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ${
                                  on
                                    ? "border-[#8b5cf6] bg-[#8b5cf6] text-white shadow-sm"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-[#8b5cf6]/50"
                                }`}
                              >
                                {tag}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-600">ข้อเสนอแนะเพิ่มเติม</span>
                      <textarea
                        rows={2}
                        maxLength={1000}
                        className={inputClass}
                        placeholder="เช่น สิ่งที่ประทับใจ หรือสิ่งที่อยากให้ปรับปรุง"
                        value={ans.comment}
                        onChange={(e) => patchAnswer(cat.key, { comment: e.target.value })}
                      />
                    </label>
                  </SectionCard>
                </div>
              );
            })}

            <div className={showErrors && overallRating == null ? "rounded-2xl ring-2 ring-rose-300" : ""}>
              <SectionCard tone={CATEGORY_TONES.overall} icon="overall" title="ความพึงพอใจโดยรวมต่อภารกิจ" subtitle="ภาพรวมการจัดภารกิจครั้งนี้">
                <StarRating name="ความพึงพอใจโดยรวม" value={overallRating} labels={labels} onChange={setOverallRating} />
              </SectionCard>
            </div>

            <SectionCard tone={CATEGORY_TONES.other} icon="other" title="ความเห็นอื่นๆ" subtitle="เรื่องอื่นที่อยากให้ปรับปรุง หรือข้อเสนอแนะต่อการจัดภารกิจ">
              <textarea
                rows={4}
                maxLength={1000}
                className={inputClass}
                placeholder="เช่น การประสานงาน ตารางเวลา การพักระหว่างทาง"
                value={otherComment}
                onChange={(e) => setOtherComment(e.target.value)}
              />
            </SectionCard>

            {err ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p> : null}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setErr(null);
                  setStep("identify");
                }}
                className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600"
              >
                ย้อนกลับ
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-3 text-[15px] font-bold text-white shadow-lg shadow-fuchsia-500/25 disabled:opacity-50"
              >
                {busy ? "กำลังส่ง…" : isEdit ? "บันทึกการแก้ไข" : "ส่งแบบประเมิน"}
              </button>
            </div>
          </form>
        ) : null}

        {step === "done" ? (
          <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-400 text-white shadow">
              <Svg className="h-7 w-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.5 4.5L19 7.5" />
              </Svg>
            </span>
            <p className="mt-3 text-lg font-black text-[#1e1b4b]">ขอบคุณสำหรับการประเมิน</p>
            <p className="mt-1 text-sm text-slate-600">ความคิดเห็นของท่านจะถูกนำไปปรับปรุงการจัดภารกิจครั้งถัดไป</p>
            <button
              type="button"
              onClick={() => {
                setIsEdit(true);
                setStep("form");
              }}
              className="mt-4 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-[#4d47b6] hover:bg-slate-50"
            >
              แก้ไขคำตอบ
            </button>
          </div>
        ) : null}
      </main>
      <footer className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-1.5 px-4 text-center">
        <img src="/logo-login.png" alt="ALL FOR ONE" draggable={false} decoding="async" className="h-5 w-auto object-contain opacity-60" />
        <p className="text-[10.5px] text-slate-400">ระบบบริหารภารกิจขนส่งธนบัตร</p>
      </footer>
    </div>
  );
}

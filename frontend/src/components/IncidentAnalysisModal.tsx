import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../api/client";
import { Modal } from "./Modal";

export const FALSE_ALARM_GROUP = "__false_alarm__";

type CauseGroup = {
  key: string;
  label: string;
  why: string;
  recommend: string;
  count: number;
  open: number;
  rainy: number;
  examples: { text: string; count: number }[];
  topPlaces: { name: string; count: number }[];
};

type AnalysisResponse = {
  total: number;
  totalInScope: number;
  open: number;
  causeGroups: CauseGroup[];
  devices: { name: string; count: number }[];
  hotspots: { name: string; count: number; open: number; topCause: string }[];
  hours: number[];
  weekdays: number[];
  months: number[];
  insights: string[];
  types: { name: string; count: number }[];
  falseAlarmCount: number;
};

const CAUSE_COLORS: Record<string, string> = {
  dirty: "#4d47b6",
  broken: "#e11d48",
  humid: "#0ea5e9",
  insect: "#65a30d",
  activity: "#f97316",
  work: "#a855f7",
  human: "#ec4899",
  unknown: "#94a3b8",
};

const MONTH_LABELS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const WEEKDAY_LABELS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const fmt = (n: number) => n.toLocaleString("th-TH");

const sectionClass = "rounded-2xl border border-slate-200 bg-white p-3";
const sectionTitleClass = "mb-2 text-xs font-black text-[#1e1b4b]";

function MiniColumns({ values, labels, color, every = 1 }: { values: number[]; labels: string[]; color: string; every?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-24 items-end gap-[3px]">
      {values.map((v, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-0.5" title={`${labels[i]}: ${fmt(v)} ครั้ง`}>
          <span className="text-[8.5px] font-bold tabular-nums text-slate-500">{v > 0 ? v : ""}</span>
          <div
            className="w-full rounded-t-[3px]"
            style={{ height: `${(v / max) * 64}px`, minHeight: v > 0 ? 2 : 0, backgroundColor: color, opacity: v === max ? 1 : 0.55 }}
          />
          <span className="h-3 text-[8.5px] leading-3 text-slate-500">{i % every === 0 ? labels[i] : ""}</span>
        </div>
      ))}
    </div>
  );
}

export function IncidentAnalysisModal({
  open,
  onClose,
  baseParams,
  scopeLabel,
  initialType = FALSE_ALARM_GROUP,
}: {
  open: boolean;
  onClose: () => void;
  baseParams: URLSearchParams;
  scopeLabel: string;
  initialType?: string;
}) {
  const [type, setType] = useState(initialType);
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (open) setType(initialType);
  }, [open, initialType]);

  const qs = useMemo(() => {
    const p = new URLSearchParams(baseParams);
    if (type) p.set("type", type);
    return p.toString();
  }, [baseParams, type]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setErr(null);
    setData(null);
    setExpanded(null);
    apiJson<AnalysisResponse>(`/api/security-incidents/stats/year/analysis?${qs}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setExpanded(d.causeGroups[0]?.key ?? null);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "วิเคราะห์ไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [open, qs]);

  if (!open) return null;

  const typeLabel =
    type === FALSE_ALARM_GROUP ? "False alarm ทั้งหมด" : type === "" ? "ทุกประเภท" : type;
  const maxCause = data?.causeGroups[0]?.count ?? 0;
  const repeatEvents = data?.hotspots.reduce((s, h) => s + h.count, 0) ?? 0;

  return (
    <Modal open onClose={onClose} title={`วิเคราะห์สาเหตุ — ${typeLabel} · ${scopeLabel}`} size="viewer">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            ประเภทที่วิเคราะห์
            <select
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-bold text-[#1e1b4b]"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value={FALSE_ALARM_GROUP}>
                False alarm ทั้งหมด{data ? ` (${fmt(data.falseAlarmCount)})` : ""}
              </option>
              <option value="">ทุกประเภท{data ? ` (${fmt(data.totalInScope)})` : ""}</option>
              {data?.types.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} ({fmt(t.count)})
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-slate-500">
            จัดกลุ่มสาเหตุอัตโนมัติจากข้อความ "สาเหตุ" ที่บันทึก — ใช้เป็นแนวทาง ไม่ใช่ผลวินิจฉัยของช่าง
          </p>
        </div>

        {err ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>
        ) : !data ? (
          <p className="py-10 text-center text-sm text-slate-500">กำลังวิเคราะห์…</p>
        ) : data.total === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">ไม่มีเหตุการณ์ในขอบเขตนี้</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                { k: "จำนวนเหตุ", v: fmt(data.total), sub: `${pct(data.total, data.totalInScope)}% ของเหตุทั้งหมด`, tone: "text-[#1e1b4b]" },
                {
                  k: "สาเหตุอันดับ 1",
                  v: data.causeGroups[0]?.label ?? "—",
                  sub: `${pct(data.causeGroups[0]?.count ?? 0, data.total)}% ของเหตุ`,
                  tone: "text-[#4d47b6]",
                },
                { k: "จุดที่เกิดซ้ำ (≥2 ครั้ง)", v: `${fmt(data.hotspots.length)} จุด`, sub: `${pct(repeatEvents, data.total)}% ของเหตุ`, tone: "text-[#ec4899]" },
                { k: "ยังเปิดอยู่", v: fmt(data.open), sub: `${pct(data.open, data.total)}%`, tone: "text-amber-700" },
              ].map((c) => (
                <div key={c.k} className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
                  <p className="text-[11px] font-medium text-slate-600">{c.k}</p>
                  <p className={`truncate text-base font-black ${c.tone}`} title={c.v}>
                    {c.v}
                  </p>
                  <p className="text-[10.5px] text-slate-500">{c.sub}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3">
              <p className="mb-1.5 text-xs font-black text-[#2e2a58]">ข้อสรุปจากการวิเคราะห์</p>
              <ul className="list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-[#1e1b4b]">
                {data.insights.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>

            <div className="grid gap-3 lg:grid-cols-12">
              <div className={`${sectionClass} lg:col-span-7`}>
                <p className={sectionTitleClass}>สาเหตุที่เกิดบ่อย — เพราะอะไร และควรแก้อย่างไร (คลิกเพื่อดูตัวอย่าง)</p>
                <ul className="space-y-1.5">
                  {data.causeGroups.map((g, i) => {
                    const color = CAUSE_COLORS[g.key] ?? "#64748b";
                    const isOpen = expanded === g.key;
                    return (
                      <li key={g.key} className="rounded-xl border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : g.key)}
                          className="w-full px-3 py-2 text-left hover:bg-slate-50/70"
                          aria-expanded={isOpen}
                        >
                          <div className="flex items-baseline gap-2 text-sm">
                            <span className="w-4 shrink-0 text-right text-xs font-bold text-slate-400">{i + 1}</span>
                            <span className="min-w-0 flex-1 truncate font-bold text-[#1e1b4b]">{g.label}</span>
                            <span className="shrink-0 font-black tabular-nums" style={{ color }}>
                              {fmt(g.count)}
                            </span>
                            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500">{pct(g.count, data.total)}%</span>
                            <span className="shrink-0 text-xs text-slate-400">{isOpen ? "▲" : "▼"}</span>
                          </div>
                          <div className="ml-6 mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full" style={{ width: `${maxCause > 0 ? (g.count / maxCause) * 100 : 0}%`, backgroundColor: color }} />
                          </div>
                        </button>
                        {isOpen ? (
                          <div className="space-y-2 border-t border-slate-100 px-3 py-2 pl-9 text-[12px] text-slate-700">
                            <p>
                              <span className="font-bold text-slate-500">เพราะ: </span>
                              {g.why}
                            </p>
                            <p>
                              <span className="font-bold text-emerald-700">ควรทำ: </span>
                              {g.recommend}
                            </p>
                            {g.topPlaces.length > 0 ? (
                              <p>
                                <span className="font-bold text-slate-500">เกิดบ่อยที่: </span>
                                {g.topPlaces.map((p) => `${p.name} (${p.count})`).join(", ")}
                              </p>
                            ) : null}
                            {g.examples.length > 0 ? (
                              <div>
                                <p className="font-bold text-slate-500">ตัวอย่างสาเหตุที่บันทึก</p>
                                <ul className="mt-0.5 space-y-0.5">
                                  {g.examples.map((e) => (
                                    <li key={e.text} className="flex gap-2">
                                      <span className="shrink-0 font-bold tabular-nums text-slate-400">{e.count}×</span>
                                      <span className="min-w-0">{e.text}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            {g.open > 0 ? <p className="text-amber-700">ยังเปิดอยู่ {fmt(g.open)} เรื่อง</p> : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="space-y-3 lg:col-span-5">
                <div className={sectionClass}>
                  <p className={sectionTitleClass}>จุดที่เกิดซ้ำบ่อย</p>
                  {data.hotspots.length === 0 ? (
                    <p className="text-xs text-slate-500">ไม่พบจุดที่เกิดซ้ำ</p>
                  ) : (
                    <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
                      {data.hotspots.map((h, i) => (
                        <li key={h.name} className="flex items-baseline gap-2 text-[12px]">
                          <span className="w-4 shrink-0 text-right font-bold text-slate-400">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-[#1e1b4b]" title={h.name}>
                              {h.name}
                            </p>
                            <p className="truncate text-[10.5px] text-slate-500">สาเหตุหลัก: {h.topCause}</p>
                          </div>
                          <span className="shrink-0 font-black tabular-nums text-[#ec4899]">{fmt(h.count)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className={sectionClass}>
                  <p className={sectionTitleClass}>อุปกรณ์ที่แจ้งเหตุ</p>
                  <ul className="space-y-1">
                    {data.devices.map((d) => (
                      <li key={d.name} className="text-[12px]">
                        <div className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate font-semibold text-[#1e1b4b]">{d.name}</span>
                          <span className="shrink-0 font-black tabular-nums text-[#2e2a58]">{fmt(d.count)}</span>
                          <span className="w-9 shrink-0 text-right text-[10.5px] tabular-nums text-slate-500">{pct(d.count, data.total)}%</span>
                        </div>
                        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-[#2e2a58]"
                            style={{ width: `${pct(d.count, data.devices[0]?.count ?? 0)}%`, opacity: 0.7 }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-12">
              <div className={`${sectionClass} lg:col-span-6`}>
                <p className={sectionTitleClass}>ช่วงเวลาที่เกิด (ชั่วโมง)</p>
                <MiniColumns
                  values={data.hours}
                  labels={data.hours.map((_, h) => String(h).padStart(2, "0"))}
                  color="#4d47b6"
                  every={3}
                />
              </div>
              <div className={`${sectionClass} lg:col-span-4`}>
                <p className={sectionTitleClass}>รายเดือน</p>
                <MiniColumns values={data.months} labels={MONTH_LABELS} color="#0ea5e9" />
              </div>
              <div className={`${sectionClass} lg:col-span-2`}>
                <p className={sectionTitleClass}>วันในสัปดาห์</p>
                <MiniColumns values={data.weekdays} labels={WEEKDAY_LABELS} color="#f59e0b" />
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

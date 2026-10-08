import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { apiDownload, apiJson } from "../api/client";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { toolbarLinkBtnClass } from "../lib/uiTokens";
import { isoToLocalDatetimeValue } from "../lib/missionEstimate";
import {
  DEFAULT_RATING_LABELS,
  evaluationUrl,
  formatScore,
  formatThaiDate,
  formatThaiDateRange,
  scoreTone,
  type EvaluationCategorySummary,
  type EvaluationDetail,
  type EvaluationLinkInfo,
} from "../lib/missionEvaluation";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function Card({ title, subtitle, tone, children, right }: { title: string; subtitle?: string; tone: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-gradient-to-br ${tone} via-white to-white p-4 shadow-sm`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#1e1b4b]">{title}</h2>
          {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stars({ value }: { value: number | null }) {
  const v = value ?? 0;
  return (
    <span className="inline-flex" aria-label={value == null ? "ไม่มีคะแนน" : `${value.toFixed(2)} จาก 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, v - (n - 1)));
        return (
          <span key={n} className="relative inline-block h-4 w-4">
            <svg viewBox="0 0 24 24" className="absolute inset-0 h-4 w-4 text-slate-200" fill="currentColor" aria-hidden>
              <path d="M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.13l-5.62 2.97 1.07-6.27L2.9 9.4l6.3-.9L12 2.8z" />
            </svg>
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-400" fill="currentColor" aria-hidden>
                <path d="M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.13l-5.62 2.97 1.07-6.27L2.9 9.4l6.3-.9L12 2.8z" />
              </svg>
            </span>
          </span>
        );
      })}
    </span>
  );
}

function Distribution({ dist, labels }: { dist: number[]; labels: Record<string, string> }) {
  const total = dist.reduce((s, n) => s + n, 0);
  return (
    <ul className="space-y-1">
      {[5, 4, 3, 2, 1].map((n) => {
        const count = dist[n - 1] ?? 0;
        const pct = total ? (count / total) * 100 : 0;
        const bar = n >= 4 ? "bg-emerald-500" : n === 3 ? "bg-amber-400" : "bg-rose-500";
        return (
          <li key={n} className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-2 text-[11px] text-slate-600">
            <span className="truncate" title={labels[String(n)]}>
              {n} · {labels[String(n)]}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-slate-100">
              <span className={`block h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="text-right tabular-nums">{count}</span>
          </li>
        );
      })}
    </ul>
  );
}

function CategoryReport({ c, labels, responseCount }: { c: EvaluationCategorySummary; labels: Record<string, string>; responseCount: number }) {
  const tone = scoreTone(c.average);
  const maxTag = c.tags[0]?.count ?? 0;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-[#1e1b4b]">{c.label}</h3>
          <p className="text-[11px] text-slate-500">
            ให้คะแนน {c.ratedCount} คน{c.naCount ? ` · ไม่ได้ใช้บริการ ${c.naCount} คน` : ""}
          </p>
        </div>
        <div className={`rounded-xl px-3 py-1.5 text-right ${tone.bg}`}>
          <p className={`text-xl font-black tabular-nums ${tone.text}`}>{formatScore(c.average)}</p>
          <p className={`text-[10px] font-semibold ${tone.text}`}>{tone.label}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-bold text-slate-500">การกระจายคะแนน</p>
          <Distribution dist={c.distribution} labels={labels} />
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-bold text-slate-500">จุดที่ควรปรับปรุง (ถูกเลือก)</p>
          {c.tags.length ? (
            <ul className="space-y-1">
              {c.tags.slice(0, 6).map((t) => (
                <li key={t.tag} className="grid grid-cols-[1fr_5rem_2.5rem] items-center gap-2 text-[11px] text-slate-600">
                  <span className="truncate">{t.tag}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full bg-[#8b5cf6]" style={{ width: `${maxTag ? (t.count / maxTag) * 100 : 0}%` }} />
                  </span>
                  <span className="text-right tabular-nums">
                    {t.count}
                    {responseCount ? <span className="text-slate-400"> ({Math.round((t.count / responseCount) * 100)}%)</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-slate-400">ไม่มีผู้เลือกจุดที่ควรปรับปรุง</p>
          )}
        </div>
      </div>
      {c.comments.length ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-1.5 text-[11px] font-bold text-slate-500">ข้อเสนอแนะ ({c.comments.length})</p>
          <ul className="space-y-1.5">
            {c.comments.map((cm, i) => (
              <li key={i} className="flex gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12.5px] text-slate-700">
                <span className={`mt-0.5 h-fit shrink-0 rounded px-1 text-[10px] font-bold tabular-nums ${scoreTone(cm.rating).bg} ${scoreTone(cm.rating).text}`}>
                  {cm.rating ?? "—"}
                </span>
                <span className="whitespace-pre-line">{cm.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function MissionEvaluationDetailPage() {
  const { missionId = "" } = useParams();
  const [data, setData] = useState<EvaluationDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const load = useCallback(async () => {
    try {
      setErr(null);
      setData(await apiJson<EvaluationDetail>(`/api/mission-evaluations/${missionId}`, { skipCache: true }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    }
  }, [missionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const link = data?.link ?? null;
  const url = link ? evaluationUrl(link.token) : "";
  const labels = data?.ratingLabels ?? DEFAULT_RATING_LABELS;
  const summary = data?.summary;
  const missionTitle = data ? data.mission.title || data.mission.code || "ภารกิจ" : "";

  async function mutateLink(path: "POST" | "PATCH", body: Record<string, unknown>) {
    setBusy(true);
    try {
      const next = await apiJson<EvaluationLinkInfo>(`/api/mission-evaluations/${missionId}/link`, {
        method: path,
        body: JSON.stringify(body),
      });
      setData((d) => (d ? { ...d, link: next } : d));
    } catch (e) {
      alert(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      alert("คัดลอกลิงก์แล้ว");
    } catch {
      prompt("คัดลอกลิงก์ด้วยตนเอง:", url);
    }
  };

  const downloadQr = () => {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `qr-ประเมินภารกิจ-${data?.mission.code ?? missionId.slice(0, 8)}.png`;
    a.click();
  };

  const printPoster = () => {
    const c = canvasRef.current;
    if (!c || !data) return;
    const w = window.open("", "_blank");
    if (!w) return alert("เบราว์เซอร์บล็อกป๊อปอัป — อนุญาตป๊อปอัปแล้วลองใหม่");
    const dateRange = formatThaiDateRange(data.mission.plannedStart, data.mission.plannedEnd);
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR แบบประเมินภารกิจ</title>
      <style>
        @page{size:A4;margin:16mm}
        body{font-family:system-ui,"Sarabun",sans-serif;color:#1e1b4b;text-align:center;margin:0}
        .band{background:linear-gradient(135deg,#0000BF,#8b5cf6);color:#fff;border-radius:18px;padding:22px 18px}
        .band small{letter-spacing:.2em;font-size:11px;opacity:.8}
        h1{font-size:30px;margin:6px 0 4px}
        .m{font-size:15px;margin:2px 0;opacity:.95}
        .qr{margin:26px auto 10px;padding:14px;border:2px solid #e0dcfa;border-radius:18px;width:max-content}
        .qr img{width:300px;height:300px;display:block}
        .topics{display:flex;justify-content:center;gap:10px;margin:14px 0}
        .topics span{border:1px solid #d9d4f7;border-radius:999px;padding:6px 14px;font-size:14px;font-weight:600}
        ol{text-align:left;max-width:420px;margin:12px auto;font-size:14px;line-height:1.8;color:#333}
        .note{font-size:12px;color:#666;margin-top:10px}
        .u{font-size:9px;color:#888;word-break:break-all;max-width:420px;margin:6px auto}
        .logo{height:44px;width:auto;margin:0 auto 14px;display:block}
      </style></head><body>
      <img class="logo" src="${window.location.origin}/logo-login.png" alt="ALL FOR ONE"/>
      <div class="band"><small>MISSION FEEDBACK</small><h1>แบบประเมินภารกิจ</h1>
        <p class="m"><b>${escapeHtml(missionTitle)}</b>${data.mission.code && data.mission.title ? ` (${escapeHtml(data.mission.code)})` : ""}</p>
        ${data.mission.routeName ? `<p class="m">เส้นทาง ${escapeHtml(data.mission.routeName)}</p>` : ""}
        <p class="m">${escapeHtml(dateRange)}</p></div>
      <div class="topics">${data.categories.map((c) => `<span>${escapeHtml(c.label)}</span>`).join("")}<span>ความเห็นอื่นๆ</span></div>
      <div class="qr"><img src="${c.toDataURL("image/png")}" alt="QR"/></div>
      <ol><li>สแกน QR ด้วยกล้องโทรศัพท์</li><li>เลือกชื่อของท่าน และกรอกเลขบัตรประชาชน 4 หลักท้าย</li><li>ให้คะแนนและข้อเสนอแนะ ใช้เวลาประมาณ 2 นาที</li></ol>
      <p class="note">ผลประเมินรายงานแบบไม่ระบุตัวตน เพื่อนำไปปรับปรุงการจัดภารกิจครั้งถัดไป${
        link?.closesAt ? ` · ปิดรับ ${escapeHtml(formatThaiDate(link.closesAt, true))}` : ""
      }</p>
      <p class="u">${escapeHtml(url)}</p></body></html>`);
    w.document.close();
    w.onload = () => {
      w.focus();
      w.print();
    };
  };

  const copyPending = async () => {
    const pending = (data?.respondents ?? []).filter((r) => !r.responded).map((r) => r.name);
    if (!pending.length) return;
    const text = `ขอความร่วมมือทำแบบประเมินภารกิจ ${missionTitle}\n${url}\n\nผู้ที่ยังไม่ได้ประเมิน:\n${pending.map((n, i) => `${i + 1}. ${n}`).join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      alert("คัดลอกข้อความติดตามแล้ว — วางในกลุ่มไลน์ได้เลย");
    } catch {
      prompt("คัดลอกข้อความด้วยตนเอง:", text);
    }
  };

  async function exportExcel() {
    try {
      await apiDownload(`/api/mission-evaluations/${missionId}/export`, undefined, "ผลประเมินภารกิจ.xlsx");
    } catch (e) {
      alert(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ");
    }
  }

  const responded = (data?.respondents ?? []).filter((r) => r.responded);
  const pending = (data?.respondents ?? []).filter((r) => !r.responded);

  return (
    <div className="space-y-4">
      <PageHeaderBar
        title={data ? `ประเมินภารกิจ · ${missionTitle}` : "ประเมินภารกิจ"}
        subtitle={
          data ? (
            <span>
              {data.mission.code ? <span className="mr-1.5 font-mono">{data.mission.code}</span> : null}
              {formatThaiDateRange(data.mission.plannedStart, data.mission.plannedEnd)}
              {data.mission.routeName ? ` · ${data.mission.routeName}` : ""}
            </span>
          ) : undefined
        }
        backTo={`/missions/${missionId}/summary`}
        extras={
          summary && summary.responseCount > 0 ? (
            <button type="button" className={toolbarLinkBtnClass} onClick={() => void exportExcel()}>
              ดาวน์โหลด Excel
            </button>
          ) : undefined
        }
      />

      {err ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p> : null}
      {!data && !err ? <p className="py-10 text-center text-sm text-slate-500">กำลังโหลด…</p> : null}

      {data && summary ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
            <Card
              title="QR แบบประเมิน"
              subtitle="ติดที่จุดพัก หรือส่งลิงก์ในกลุ่มไลน์ของทริป"
              tone="from-indigo-50/70"
              right={
                link ? (
                  link.accepting ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      เปิดรับคำตอบ
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">ปิดรับแล้ว</span>
                  )
                ) : null
              }
            >
              {link ? (
                <div className="space-y-3">
                  <div className="mx-auto w-fit rounded-2xl border border-slate-100 bg-white p-3 shadow-inner">
                    <QRCodeCanvas ref={canvasRef} value={url} size={200} level="M" marginSize={1} />
                  </div>
                  <p className="break-all rounded-lg bg-slate-50 px-2 py-1.5 text-center font-mono text-[10.5px] text-slate-500">{url}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button type="button" onClick={() => void copy()} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100">
                      คัดลอกลิงก์
                    </button>
                    <button type="button" onClick={downloadQr} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                      ดาวน์โหลด QR
                    </button>
                    <button type="button" onClick={printPoster} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                      พิมพ์โปสเตอร์
                    </button>
                  </div>
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                    <label className="flex cursor-pointer items-center justify-between gap-2 text-xs font-semibold text-slate-700">
                      เปิดรับคำตอบ
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={link.isOpen}
                        disabled={busy}
                        onChange={(e) => void mutateLink("PATCH", { isOpen: e.target.checked })}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-600">ปิดรับอัตโนมัติ (ไม่บังคับ)</span>
                      <input
                        type="datetime-local"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800"
                        value={isoToLocalDatetimeValue(link.closesAt)}
                        disabled={busy}
                        onChange={(e) =>
                          void mutateLink("PATCH", { closesAt: e.target.value ? new Date(e.target.value).toISOString() : null })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (confirm("ออก QR ใหม่? QR และลิงก์เดิมจะใช้ไม่ได้ทันที (คำตอบที่ได้รับแล้วยังอยู่ครบ)")) {
                          void mutateLink("POST", { regenerate: true });
                        }
                      }}
                      className="text-[11px] font-semibold text-rose-600 hover:underline"
                    >
                      ออก QR ใหม่ (ยกเลิก QR เดิม)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 py-4 text-center">
                  <p className="text-sm text-slate-600">ยังไม่ได้สร้าง QR สำหรับภารกิจนี้</p>
                  <button
                    type="button"
                    disabled={busy || data.respondents.length === 0}
                    onClick={() => void mutateLink("POST", {})}
                    className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 disabled:opacity-40"
                  >
                    สร้าง QR แบบประเมิน
                  </button>
                  {data.respondents.length === 0 ? <p className="text-[11px] text-amber-700">เพิ่มบุคลากรในภารกิจก่อน</p> : null}
                </div>
              )}
            </Card>

            <div className="space-y-4">
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-bold text-slate-500">อัตราการตอบกลับ</p>
                  <p className="mt-1 text-2xl font-black tabular-nums text-[#1e1b4b]">{summary.responseRate}%</p>
                  <p className="text-[11px] text-slate-500">
                    {summary.responseCount} จาก {summary.crewCount} คน
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-bold text-slate-500">ความพึงพอใจโดยรวม</p>
                  <p className={`mt-1 text-2xl font-black tabular-nums ${scoreTone(summary.overall.average).text}`}>
                    {formatScore(summary.overall.average)}
                    <span className="ml-1 text-xs font-semibold text-slate-400">/ 5</span>
                  </p>
                  <Stars value={summary.overall.average} />
                </div>
                {summary.categories.map((c) => (
                  <div key={c.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="truncate text-[11px] font-bold text-slate-500">{c.label}</p>
                    <p className={`mt-1 text-2xl font-black tabular-nums ${scoreTone(c.average).text}`}>
                      {formatScore(c.average)}
                      <span className="ml-1 text-xs font-semibold text-slate-400">/ 5</span>
                    </p>
                    <Stars value={c.average} />
                  </div>
                ))}
              </section>

              {summary.responseCount > 0 ? (
                <Card title="ประเด็นที่ควรเร่งปรับปรุง" subtitle="จุดที่ถูกเลือกมากที่สุดจากทุกด้าน" tone="from-rose-50/60">
                  {(() => {
                    const top = summary.categories
                      .flatMap((c) => c.tags.map((t) => ({ ...t, category: c.label })))
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 5);
                    return top.length ? (
                      <ol className="space-y-1.5">
                        {top.map((t, i) => (
                          <li key={`${t.category}-${t.tag}`} className="flex items-center gap-2 text-sm text-slate-700">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[11px] font-black text-rose-700">{i + 1}</span>
                            <span className="min-w-0 flex-1 truncate">
                              {t.tag} <span className="text-[11px] text-slate-400">· {t.category}</span>
                            </span>
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-600">
                              {t.count} คน ({Math.round((t.count / summary.responseCount) * 100)}%)
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-slate-500">ยังไม่มีผู้เลือกจุดที่ควรปรับปรุง</p>
                    );
                  })()}
                </Card>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500">
                  ยังไม่มีผู้ตอบแบบประเมิน — ผลจะแสดงที่นี่ทันทีเมื่อมีผู้ส่ง
                </div>
              )}
            </div>
          </div>

          {summary.responseCount > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {summary.categories.map((c) => (
                <CategoryReport key={c.key} c={c} labels={labels} responseCount={summary.responseCount} />
              ))}
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-[#1e1b4b]">ความพึงพอใจโดยรวม และความเห็นอื่นๆ</h3>
                    <p className="text-[11px] text-slate-500">{summary.otherComments.length} ความเห็น</p>
                  </div>
                </div>
                <div className="mt-3">
                  <Distribution dist={summary.overall.distribution} labels={labels} />
                </div>
                {summary.otherComments.length ? (
                  <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                    {summary.otherComments.map((cm, i) => (
                      <li key={i} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12.5px] text-slate-700">
                        <span className="whitespace-pre-line">{cm.text}</span>
                        <span className="ml-2 text-[10px] text-slate-400">{formatThaiDate(cm.at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            </div>
          ) : null}

          <Card
            title="สถานะการตอบ"
            subtitle="แสดงเฉพาะว่าใครตอบแล้ว — ไม่แสดงว่าใครตอบอะไร"
            tone="from-violet-50/60"
            right={
              link && pending.length ? (
                <button type="button" onClick={() => void copyPending()} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-[#4d47b6] hover:bg-slate-50">
                  คัดลอกข้อความติดตามผู้ที่ยังไม่ตอบ
                </button>
              ) : null
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-bold text-emerald-700">ตอบแล้ว ({responded.length})</p>
                <ul className="space-y-1">
                  {responded.map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50/60 px-2.5 py-1.5 text-xs text-slate-700">
                      <span className="truncate">
                        {r.name}
                        {r.role ? <span className="text-slate-400"> · {r.role}</span> : null}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">{formatThaiDate(r.respondedAt, true)}</span>
                    </li>
                  ))}
                  {!responded.length ? <li className="text-xs text-slate-400">—</li> : null}
                </ul>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-bold text-amber-700">ยังไม่ตอบ ({pending.length})</p>
                <ul className="space-y-1">
                  {pending.map((r, i) => (
                    <li key={i} className="truncate rounded-lg bg-amber-50/60 px-2.5 py-1.5 text-xs text-slate-700">
                      {r.name}
                      {r.role ? <span className="text-slate-400"> · {r.role}</span> : null}
                    </li>
                  ))}
                  {!pending.length ? <li className="text-xs text-slate-400">ครบทุกคนแล้ว</li> : null}
                </ul>
              </div>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

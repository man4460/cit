import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiDownload, apiFormJson, apiJson } from "../api/client";
import { MissionSummaryModal } from "../components/MissionSummaryModal";
import { Modal, ModalFormBody, ModalFormSection } from "../components/Modal";
import { ModuleDocumentsModal } from "../components/ModuleDocumentsModal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import {
  OTHER_MISSION_COMP_RATES,
  POLICE_COMP_NOTES,
  POLICE_DEST_GROUPS,
} from "../lib/policeCompensationRates";
import { MissionsSubNav } from "../components/MissionsSubNav";
import { PrintA4Table } from "../components/PrintA4Table";
import { MODULE_DOCUMENT_CATEGORIES } from "../lib/moduleDocumentCategories";
import {
  brandGradientFillClass,
  listCardAccentClass,
  listCardClass,
  toolbarLinkBtnClass,
  toolbarMasterBtnClass,
  toolbarMasterGroupClass,
  toolbarPrimaryBtnClass,
} from "../lib/uiTokens";
import { rowMatchesFilter } from "../lib/searchNormalize";
import type { MissionListItem, MissionStatus, MissionSummary } from "../types";

function formatMissionListDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function missionYearBe(m: MissionListItem): number | null {
  const fromCode = m.code?.match(/TRIP-(\d{4})(?:-|$)/i);
  if (fromCode) {
    const y = Number(fromCode[1]);
    if (Number.isFinite(y) && y >= 2400) return y;
  }
  for (const iso of [m.plannedStart, m.plannedEnd]) {
    if (!iso) continue;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d.getFullYear() + 543;
  }
  return null;
}

const missionStatusLabel: Record<MissionStatus, string> = {
  DRAFT: "แบบร่าง",
  PLANNED: "วางแผน",
  IN_PROGRESS: "กำลังทำ",
  COMPLETED: "เสร็จแล้ว",
  CANCELLED: "ยกเลิก",
};

const missionStatusChip: Record<MissionStatus, string> = {
  DRAFT: "bg-slate-500/15 text-slate-700",
  PLANNED: "bg-[#0000BF]/12 text-[#4d47b6]",
  IN_PROGRESS: "bg-amber-500/15 text-amber-800",
  COMPLETED: "bg-emerald-500/15 text-emerald-700",
  CANCELLED: "bg-rose-500/15 text-rose-700",
};

export function MissionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [docsOpen, setDocsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [summary, setSummary] = useState<MissionSummary | null>(null);
  const [listFilter, setListFilter] = useState("");
  const [yearFilter, setYearFilter] = useState<number | null>(() => new Date().getFullYear() + 543);
  const [summaryAttachUploading, setSummaryAttachUploading] = useState(false);
  const summaryMissionIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const m = await apiJson<MissionListItem[]>("/api/missions");
    setMissions(m);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openSummary(id: string) {
    summaryMissionIdRef.current = id;
    setSummaryId(id);
    try {
      const s = await apiJson<MissionSummary>(`/api/missions/${id}/summary`);
      setSummary(s);
    } catch (e) {
      summaryMissionIdRef.current = null;
      setSummaryId(null);
      setSummary(null);
      alert(e instanceof Error ? e.message : "โหลดสรุปภารกิจไม่สำเร็จ");
    }
  }

  useEffect(() => {
    const sid = searchParams.get("summary");
    if (!sid) return;
    void openSummary(sid).then(() => {
      const next = new URLSearchParams(searchParams);
      next.delete("summary");
      setSearchParams(next, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reloadMissionSummary() {
    const mid = summaryMissionIdRef.current;
    if (!mid) return;
    const s = await apiJson<MissionSummary>(`/api/missions/${mid}/summary`);
    setSummary(s);
  }

  async function uploadMissionSummaryFiles(files: File[]) {
    const mid = summaryMissionIdRef.current;
    if (!files.length) return;
    if (!mid) {
      alert("ไม่พบรหัสภารกิจ — ปิดหน้าต่างแล้วเปิด «สรุปภารกิจ» อีกครั้ง");
      return;
    }
    setSummaryAttachUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      await apiFormJson(`/api/missions/${mid}/attachments`, fd);
      await reloadMissionSummary();
    } catch (e) {
      alert(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setSummaryAttachUploading(false);
    }
  }

  async function downloadAllMissionsExcel() {
    try {
      await apiDownload("/api/missions/export.xlsx", { method: "GET" }, "รายการภารกิจทั้งหมด.xlsx");
    } catch (e) {
      alert(e instanceof Error ? e.message : "ดาวน์โหลด Excel ไม่สำเร็จ");
    }
  }

  async function deleteMissionSummaryAttachment(attachmentId: string) {
    const mid = summaryMissionIdRef.current;
    if (!mid || !confirm("ลบไฟล์นี้?")) return;
    try {
      await apiJson(`/api/missions/${mid}/attachments/${attachmentId}`, { method: "DELETE" });
      await reloadMissionSummary();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  async function deleteMission(id: string, label: string) {
    if (!confirm(`ลบภารกิจ "${label}" ?`)) return;
    try {
      await apiJson(`/api/missions/${id}`, { method: "DELETE" });
      if (summaryId === id) {
        summaryMissionIdRef.current = null;
        setSummaryId(null);
        setSummary(null);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  const missionYears = useMemo(() => {
    const set = new Set<number>();
    set.add(new Date().getFullYear() + 543);
    for (const m of missions) {
      const y = missionYearBe(m);
      if (y != null) set.add(y);
    }
    return [...set].sort((a, b) => b - a);
  }, [missions]);

  const filteredMissions = useMemo(
    () =>
      missions.filter((m) => {
        if (yearFilter != null && missionYearBe(m) !== yearFilter) return false;
        return rowMatchesFilter(listFilter, [
          m.title,
          m.code,
          m.status,
          formatMissionListDateTime(m.plannedStart),
          formatMissionListDateTime(m.plannedEnd),
          m.route?.startLocation,
          m.route?.endLocation,
          m.route?.name,
          missionYearBe(m)?.toString(),
        ]);
      }),
    [missions, listFilter, yearFilter],
  );

  return (
    <div>
      <PageHeaderBar
        title="ภารกิจ"
        count={filteredMissions.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "ภารกิจ",
          placeholder: "กรองชื่อ / รหัส / สถานะ / เวลา / เส้นทาง…",
        }}
        segments={
          missionYears.length > 0 ? (
            <div className={toolbarMasterGroupClass}>
              <button
                type="button"
                onClick={() => setYearFilter(null)}
                className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-black transition sm:h-9 sm:px-3 sm:text-xs ${
                  yearFilter == null
                    ? `${brandGradientFillClass} text-white shadow-md`
                    : toolbarMasterBtnClass
                }`}
              >
                ทุกปี
              </button>
              {missionYears.map((y) => {
                const active = yearFilter === y;
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setYearFilter(y)}
                    className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-black transition sm:h-9 sm:px-3 sm:text-xs ${
                      active ? `${brandGradientFillClass} text-white shadow-md` : toolbarMasterBtnClass
                    }`}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          ) : undefined
        }
        extras={
          <>
            <button type="button" className={toolbarLinkBtnClass} onClick={() => void downloadAllMissionsExcel()}>
              ดาวน์โหลด Excel
            </button>
            <button type="button" className={toolbarLinkBtnClass} onClick={() => setNotesOpen(true)}>
              โน้ตสำคัญ
            </button>
            <button type="button" className={toolbarLinkBtnClass} onClick={() => setDocsOpen(true)}>
              เอกสาร
            </button>
            <Link to="/missions/new" className={toolbarPrimaryBtnClass}>
              สร้างภารกิจ
            </Link>
          </>
        }
        primary={<MissionsSubNav />}
      />

      <div className="mt-6 print:hidden">
        {missions.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ยังไม่มีรายการ — กด «สร้างภารกิจ»
          </div>
        ) : filteredMissions.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ไม่มีรายการที่ตรงกับการกรอง
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredMissions.map((m, idx) => {
              const label = m.title ?? m.code ?? m.id.slice(0, 8);
              return (
                <li key={m.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => void openSummary(m.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void openSummary(m.id);
                      }
                    }}
                    className={`${listCardClass} cursor-pointer transition hover:border-[#0000BF]/35`}
                  >
                    <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                    <div className="min-w-0 flex-1 pl-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm font-bold text-[#1e1b4b]">{label}</p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${missionStatusChip[m.status]}`}
                        >
                          {missionStatusLabel[m.status]}
                        </span>
                      </div>
                      {m.code ? (
                        <p className="mt-1 font-mono text-[11px] text-[#66638c]">{m.code}</p>
                      ) : null}
                      <p className="mt-2 text-[11px] text-slate-600">
                        <span className="font-medium text-[#4d47b6]">ไป</span>{" "}
                        {formatMissionListDateTime(m.plannedStart)}
                        <span className="mx-1.5 text-slate-400">·</span>
                        <span className="font-medium text-[#ec4899]">กลับ</span>{" "}
                        {formatMissionListDateTime(m.plannedEnd)}
                      </p>
                      {m.route ? (
                        <p className="mt-1.5 truncate text-xs font-medium text-[#2e2a58]">
                          {m.route.startLocation}
                          <span className="mx-1 text-[#8b5cf6]">→</span>
                          {m.route.endLocation}
                        </p>
                      ) : null}
                      {typeof m._count.attachments === "number" && m._count.attachments > 0 ? (
                        <p className="mt-1 text-[10px] font-medium text-violet-600">
                          แนบไฟล์ {m._count.attachments} รายการ
                        </p>
                      ) : null}
                    </div>
                    <div
                      className="mt-3 flex flex-wrap gap-1.5 border-t border-[#ecebff] pt-2.5 pl-2"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Link
                        to={`/missions/${m.id}/duplicate`}
                        title="นำข้อมูลไปสร้างภารกิจใหม่"
                        className="rounded-lg border border-[#dcd8f0] bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-[#0000BF]/5"
                      >
                        คัดลอก
                      </Link>
                      <Link
                        to={`/missions/${m.id}/edit`}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                      >
                        แก้ไข
                      </Link>
                      <button
                        type="button"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
                        onClick={() => void deleteMission(m.id, label)}
                      >
                        ลบ
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-[#0000BF]/20 bg-[#0000BF]/8 px-2.5 py-1 text-xs font-medium text-[#4d47b6] hover:bg-[#0000BF]/12"
                        onClick={() => void openSummary(m.id)}
                      >
                        สรุป
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <PrintA4Table
        columns={[
          { label: "ภารกิจ" },
          { label: "รหัส" },
          { label: "สถานะ" },
          { label: "ไป" },
          { label: "กลับ" },
          { label: "เส้นทาง" },
        ]}
        rows={filteredMissions.map((m) => [
          m.title ?? m.code ?? m.id.slice(0, 8),
          m.code || "—",
          missionStatusLabel[m.status],
          formatMissionListDateTime(m.plannedStart),
          formatMissionListDateTime(m.plannedEnd),
          m.route ? `${m.route.startLocation} → ${m.route.endLocation}` : "—",
        ])}
      />

      {summaryId && summary ? (
        <MissionSummaryModal
          summary={summary}
          attachUploading={summaryAttachUploading}
          onClose={() => {
            summaryMissionIdRef.current = null;
            setSummaryId(null);
            setSummary(null);
          }}
          onUploadFiles={(files) => void uploadMissionSummaryFiles(files)}
          onDeleteAttachment={(id) => void deleteMissionSummaryAttachment(id)}
        />
      ) : null}

      <ModuleDocumentsModal
        open={docsOpen}
        categoryName={MODULE_DOCUMENT_CATEGORIES.missions}
        onClose={() => setDocsOpen(false)}
      />

      <Modal open={notesOpen} onClose={() => setNotesOpen(false)} title="โน้ตสำคัญ — อัตราค่าตอบแทน จนท.ตร." size="wide">
        <ModalFormBody>
          <ModalFormSection title="เกณฑ์ค่าตอบแทน จนท.ตร. คุ้มครองการปฏิบัติงาน ธปท. (มีผล 1 ส.ค. 2566)">
            <div className="overflow-x-auto rounded-xl border border-[#e8e6fc]">
              <table className="min-w-[40rem] w-full border-collapse text-left text-[11px] sm:text-xs">
                <thead>
                  <tr className="bg-[#eef2ff] text-[#1e1b4b]">
                    <th className="border-b border-[#d8d9ff] px-2 py-2 font-bold" rowSpan={2}>กลุ่มปลายทาง</th>
                    <th className="border-b border-[#d8d9ff] px-2 py-1.5 text-center font-bold" colSpan={2}>เที่ยวเดียว (บาท/คน/ครั้ง)</th>
                    <th className="border-b border-[#d8d9ff] px-2 py-1.5 text-center font-bold" colSpan={2}>ไป-กลับ (บาท/คน/ครั้ง)</th>
                  </tr>
                  <tr className="bg-[#eef2ff] text-[#2e2a58]">
                    <th className="border-b border-[#d8d9ff] px-2 py-1.5 text-center font-semibold">สัญญาบัตร</th>
                    <th className="border-b border-[#d8d9ff] px-2 py-1.5 text-center font-semibold">ประทวน</th>
                    <th className="border-b border-[#d8d9ff] px-2 py-1.5 text-center font-semibold">สัญญาบัตร</th>
                    <th className="border-b border-[#d8d9ff] px-2 py-1.5 text-center font-semibold">ประทวน</th>
                  </tr>
                </thead>
                <tbody>
                  {POLICE_DEST_GROUPS.map((g) => (
                    <tr key={g.id} className="border-b border-[#ecebff] last:border-0">
                      <td className="px-2 py-2 font-semibold text-[#1e1b4b]">{g.label}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{g.commissioned.oneWay.toLocaleString("th-TH")}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{g.enlisted.oneWay.toLocaleString("th-TH")}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{g.commissioned.roundTrip.toLocaleString("th-TH")}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{g.enlisted.roundTrip.toLocaleString("th-TH")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 overflow-x-auto rounded-xl border border-[#e8e6fc]">
              <table className="min-w-[44rem] w-full border-collapse text-left text-[11px] sm:text-xs">
                <thead>
                  <tr className="bg-[#eef2ff] text-[#1e1b4b]">
                    <th className="border-b border-[#d8d9ff] px-2 py-2 font-bold" colSpan={5}>
                      ค่าตอบแทนเจ้าหน้าที่ตำรวจปฏิบัติการกิจพิเศษตามที่ ธปท. ร้องขอ (บาท/คน/วัน)
                    </th>
                  </tr>
                  <tr className="bg-[#eef2ff] text-[#2e2a58]">
                    <th className="border-b border-[#d8d9ff] px-2 py-1.5 text-center font-semibold">ลำดับ</th>
                    <th className="border-b border-[#d8d9ff] px-2 py-1.5 font-semibold">ประเภทรายการ</th>
                    <th className="border-b border-[#d8d9ff] px-2 py-1.5 font-semibold">จำนวนคน/วัน</th>
                    <th className="border-b border-[#d8d9ff] px-2 py-1.5 text-center font-semibold">อัตราค่าตอบแทน</th>
                    <th className="border-b border-[#d8d9ff] px-2 py-1.5 font-semibold">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {OTHER_MISSION_COMP_RATES.map((row) => (
                    <tr key={row.order} className="border-b border-[#ecebff] last:border-0">
                      <td className="px-2 py-2 text-center tabular-nums">{row.order}</td>
                      <td className="px-2 py-2 font-semibold text-[#1e1b4b]">{row.itemType}</td>
                      <td className="px-2 py-2 leading-relaxed">{row.qtyNote}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{row.rate.toLocaleString("th-TH")} บาท</td>
                      <td className="px-2 py-2 leading-relaxed">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 overflow-x-auto rounded-xl border border-[#e8e6fc]">
              <table className="min-w-[30rem] w-full border-collapse text-left text-[11px] sm:text-xs">
                <thead>
                  <tr className="bg-[#eef2ff] text-[#1e1b4b]">
                    <th className="border-b border-[#d8d9ff] px-2 py-2 font-bold">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {POLICE_COMP_NOTES.map((n) => (
                    <tr key={n} className="border-b border-[#ecebff] last:border-0">
                      <td className="px-2 py-2 leading-relaxed">{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ModalFormSection>
        </ModalFormBody>
      </Modal>
    </div>
  );
}

import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { ListPagination } from "../components/ListPagination";
import { Modal, ModalFormBody } from "../components/Modal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { toolbarLinkBtnClass } from "../lib/uiTokens";
import type { AuditLogEntry } from "../types";

const PAGE_SIZE = 25;

function formatThDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actionLabel(a: string) {
  if (a === "CREATE") return "สร้าง";
  if (a === "DELETE") return "ลบ";
  return "แก้ไข";
}

function entityTypeLabel(t: string) {
  const map: Record<string, string> = {
    Vehicle: "ยานพาหนะ",
    Vehicles: "ยานพาหนะ",
    Asset: "วัสดุทั่วไป",
    Assets: "วัสดุทั่วไป",
    Personnel: "บุคลากร",
    Mission: "ภารกิจ",
    Missions: "ภารกิจ",
    Task: "กิจกรรม",
    Tasks: "กิจกรรม",
    WorkTask: "กิจกรรม",
    LibraryDocument: "เอกสารคลัง",
    LibraryDocuments: "เอกสารคลัง",
    Firearm: "อาวุธปืน",
    Firearms: "อาวุธปืน",
    Ammunition: "กระสุน",
    BulletproofVest: "เสื้อเกราะ",
    BulletproofVests: "เสื้อเกราะ",
    FireExtinguisher: "ถังดับเพลิง",
    FireExtinguishers: "ถังดับเพลิง",
    FireHost: "จุดอัคคีภัย",
    FireHosts: "จุดอัคคีภัย",
    SecurityIncident: "เหตุการณ์ความมั่นคง",
    SecurityIncidents: "เหตุการณ์ความมั่นคง",
    RouteMaster: "เส้นทาง",
    TrainingCourse: "หลักสูตรอบรม",
    TrainingCourses: "หลักสูตรอบรม",
    TrainingEnrollment: "ทะเบียนอบรม",
    TrainingEnrollments: "ทะเบียนอบรม",
    ArmorInspection: "ตรวจเสื้อเกราะ",
    ArmorInspections: "ตรวจเสื้อเกราะ",
    AdminUser: "ผู้ใช้ระบบ",
    Me: "โปรไฟล์",
    VehicleType: "ประเภทรถ",
    VehicleTypes: "ประเภทรถ",
    VehicleStatus: "สถานะรถ",
    VehicleStatuses: "สถานะรถ",
    WorkCategoryGroup: "กลุ่มงานรถ",
    WorkCategoryGroups: "กลุ่มงานรถ",
    AssetCategory: "หมวดวัสดุ",
    AssetCategories: "หมวดวัสดุ",
    AssetRoutine: "วงจรวัสดุ",
    AssetRoutines: "วงจรวัสดุ",
    AssetAffiliation: "สังกัดวัสดุ",
    AssetAffiliations: "สังกัดวัสดุ",
    AssetItemStatus: "สถานะวัสดุ",
    AssetItemStatuses: "สถานะวัสดุ",
    PersonnelCategory: "ประเภทบุคลากร",
    PersonnelCategories: "ประเภทบุคลากร",
    OrganizationUnitType: "ประเภทหน่วยงาน",
    OrganizationUnitTypes: "ประเภทหน่วยงาน",
    DocumentType: "ประเภทเอกสาร",
    DocumentTypes: "ประเภทเอกสาร",
    MissionPersonnelRole: "บทบาทบุคลากรภารกิจ",
    MissionPersonnelRoles: "บทบาทบุคลากรภารกิจ",
    MissionVehicleRole: "บทบาทรถภารกิจ",
    MissionVehicleRoles: "บทบาทรถภารกิจ",
    MissionExpenseType: "ประเภทค่าใช้จ่ายภารกิจ",
    MissionExpenseTypes: "ประเภทค่าใช้จ่ายภารกิจ",
  };
  return map[t] ?? t;
}

function prettyJson(raw: string | null) {
  if (!raw) return "—";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

const selectClass =
  "h-9 rounded-lg border border-[#dcd8f0] bg-white/95 px-2 text-xs font-semibold text-[#1e1b3a] outline-none ring-[#0000BF]/20 focus:ring-2";
const dateClass =
  "h-9 rounded-lg border border-[#dcd8f0] bg-white/95 px-2 text-xs font-semibold text-[#1e1b3a] outline-none ring-[#0000BF]/20 focus:ring-2";

type AuditMeta = { entityTypes: string[]; actors: string[] };
type AuditPage = {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export function AuditTrailPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [meta, setMeta] = useState<AuditMeta>({ entityTypes: [], actors: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState("");
  const deferredQ = useDeferredValue(listFilter.trim());
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const action = searchParams.get("action") ?? "";
  const actor = searchParams.get("actor") ?? "";
  const entityType = searchParams.get("entityType") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);

  function patchParams(patch: Record<string, string>, resetPage = false) {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        if (resetPage) p.delete("page");
        return p;
      },
      { replace: true },
    );
  }

  const loadMeta = useCallback(async () => {
    try {
      const data = await apiJson<AuditMeta>("/api/audit-logs/meta");
      setMeta({
        entityTypes: data.entityTypes ?? [],
        actors: data.actors ?? [],
      });
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      qs.set("page", String(page));
      qs.set("pageSize", String(PAGE_SIZE));
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      if (action) qs.set("action", action);
      if (actor) qs.set("actor", actor);
      if (entityType) qs.set("entityType", entityType);
      if (deferredQ) qs.set("q", deferredQ);
      const data = await apiJson<AuditPage>(`/api/audit-logs?${qs.toString()}`);
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
      setPageCount(Math.max(1, data.pageCount ?? 1));
    } catch (e) {
      setRows([]);
      setTotal(0);
      setPageCount(1);
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [from, to, action, actor, entityType, page, deferredQ]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (page > pageCount) patchParams({ page: String(pageCount) });
  }, [page, pageCount]);

  const hasStructuredFilter = Boolean(from || to || action || actor || entityType);

  const filterControls = (
    <div className="flex w-full flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-[11px] font-bold text-[#66638c]">
        จาก
        <input
          type="date"
          value={from}
          onChange={(e) => patchParams({ from: e.target.value }, true)}
          className={dateClass}
        />
      </label>
      <label className="flex items-center gap-1.5 text-[11px] font-bold text-[#66638c]">
        ถึง
        <input
          type="date"
          value={to}
          onChange={(e) => patchParams({ to: e.target.value }, true)}
          className={dateClass}
        />
      </label>
      <select
        value={action}
        onChange={(e) => patchParams({ action: e.target.value }, true)}
        className={selectClass}
        aria-label="การกระทำ"
      >
        <option value="">การกระทำทั้งหมด</option>
        <option value="CREATE">สร้าง</option>
        <option value="UPDATE">แก้ไข</option>
        <option value="DELETE">ลบ</option>
      </select>
      <select
        value={actor}
        onChange={(e) => patchParams({ actor: e.target.value }, true)}
        className={`min-w-[10rem] max-w-[14rem] ${selectClass}`}
        aria-label="ผู้ใช้"
      >
        <option value="">ผู้ใช้ทั้งหมด</option>
        {meta.actors.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <select
        value={entityType}
        onChange={(e) => patchParams({ entityType: e.target.value }, true)}
        className={`min-w-[9rem] max-w-[14rem] ${selectClass}`}
        aria-label="ประเภท"
      >
        <option value="">ประเภททั้งหมด</option>
        {meta.entityTypes.map((t) => (
          <option key={t} value={t}>
            {entityTypeLabel(t)}
          </option>
        ))}
      </select>
      {hasStructuredFilter ? (
        <button
          type="button"
          onClick={() => patchParams({ from: "", to: "", action: "", actor: "", entityType: "" }, true)}
          className={toolbarLinkBtnClass}
        >
          ล้างตัวกรอง
        </button>
      ) : null}
    </div>
  );

  return (
    <div>
      <PageHeaderBar
        title="ความเคลื่อนไหว"
        filter={{
          value: listFilter,
          onChange: (v) => {
            setListFilter(v);
          },
          printTitle: "ความเคลื่อนไหว",
          placeholder: "ค้นหาสรุป / รหัส…",
          defaultOpen: true,
          trailing: filterControls,
        }}
        extras={
          <button type="button" onClick={() => void load()} className={toolbarLinkBtnClass}>
            รีเฟรช
          </button>
        }
      />

      {err ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-center text-sm font-semibold text-[#66638c]">กำลังโหลด…</p>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-[1.25rem] border border-[#e8e6fc]/90 bg-white/75 shadow-[0_12px_36px_-24px_rgba(30,27,75,0.28)]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[#e8e6fc] bg-gradient-to-r from-[#f5f3ff]/95 via-white/90 to-[#fdf2f8]/80 text-[11px] font-bold uppercase tracking-wide text-[#66638c]">
                  <tr>
                    <th className="px-4 py-2.5">เวลา</th>
                    <th className="px-4 py-2.5">การกระทำ</th>
                    <th className="px-4 py-2.5">ประเภท</th>
                    <th className="px-4 py-2.5">สรุป</th>
                    <th className="px-4 py-2.5">ผู้ใช้</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                        ไม่พบรายการตามเงื่อนไข
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer border-b border-[#ecebff] last:border-0 bg-white/50 transition hover:bg-[#0000BF]/[0.04]"
                        onClick={() => setDetail(r)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setDetail(r);
                          }
                        }}
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">{formatThDateTime(r.createdAt)}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex rounded-full bg-[#0000BF]/8 px-2 py-0.5 text-[10px] font-black text-[#4d47b6]">
                            {actionLabel(r.action)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{entityTypeLabel(r.entityType)}</td>
                        <td className="max-w-[22rem] truncate px-4 py-2.5 text-slate-800">{r.summary}</td>
                        <td className="px-4 py-2.5 text-slate-600">{r.actorUsername ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <ListPagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={(p) => patchParams({ page: p <= 1 ? "" : String(p) })}
          />
        </>
      )}

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="รายละเอียดความเคลื่อนไหว" size="wide">
        {detail ? (
          <ModalFormBody>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-slate-600">เวลา</dt>
                <dd className="mt-0.5 text-slate-800">{formatThDateTime(detail.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-600">การกระทำ</dt>
                <dd className="mt-0.5 text-slate-800">{actionLabel(detail.action)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-600">ประเภท</dt>
                <dd className="mt-0.5 text-slate-800">{entityTypeLabel(detail.entityType)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-600">รหัสรายการ</dt>
                <dd className="mt-0.5 break-all font-mono text-[11px] text-slate-700">{detail.entityId}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-slate-600">สรุป</dt>
                <dd className="mt-0.5 text-slate-800">{detail.summary}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-slate-600">ผู้ใช้</dt>
                <dd className="mt-0.5 text-slate-800">{detail.actorUsername ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-600">ก่อนแก้</dt>
                <dd className="mt-1 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[10px] leading-relaxed text-slate-700 whitespace-pre-wrap">
                  {prettyJson(detail.beforeJson)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-600">หลังแก้</dt>
                <dd className="mt-1 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[10px] leading-relaxed text-slate-700 whitespace-pre-wrap">
                  {prettyJson(detail.afterJson)}
                </dd>
              </div>
            </dl>
          </ModalFormBody>
        ) : null}
      </Modal>
    </div>
  );
}

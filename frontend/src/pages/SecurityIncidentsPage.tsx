import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson } from "../api/client";
import { ListPagination } from "../components/ListPagination";
import { Modal, ModalFormBody } from "../components/Modal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { listCardAccentClass, listCardClass, brandGradientFillClass, toolbarLinkBtnClass, toolbarMasterBtnClass, toolbarMasterGroupClass } from "../lib/uiTokens";
import type { SecurityIncident } from "../types";
import type { LoadOptions } from "../lib/loadOptions";
import { setLoadBusy } from "../lib/loadOptions";

const PAGE_SIZE = 24; // 3 คอลัมน์ × 8 แถว

type PeriodFilter = "" | "today" | "month" | "quarter" | "year";

function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function periodRange(period: PeriodFilter): { start: Date; end: Date } | null {
  if (!period) return null;
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (period === "today") {
    return { start: startOfLocalDay(now), end };
  }
  if (period === "month") {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0), end };
  }
  if (period === "quarter") {
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return { start: new Date(now.getFullYear(), qStartMonth, 1, 0, 0, 0, 0), end };
  }
  // year (ค.ศ. ปีปฏิทินปัจจุบัน)
  return { start: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0), end };
}

function inPeriod(iso: string | null | undefined, period: PeriodFilter): boolean {
  if (!period) return true;
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const range = periodRange(period);
  if (!range) return true;
  return d >= range.start && d <= range.end;
}

function formatThDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
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

function formatThDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function parseListField(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const s = raw.trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s.replace(/'/g, '"')) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* plain text */
  }
  return [s];
}

function DetailBlock({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#1e1b4b]">{value}</p>
    </div>
  );
}

export function SecurityIncidentsPage() {
  const [rows, setRows] = useState<SecurityIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("");
  const [detail, setDetail] = useState<SecurityIncident | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const load = useCallback(async (opts?: LoadOptions) => {
    setLoadBusy(setLoading, opts, true);
    setErr(null);
    try {
      const [data, meta] = await Promise.all([
        apiJson<SecurityIncident[]>("/api/security-incidents?take=5000"),
        apiJson<{ incidentTypes: string[]; locations: string[] }>("/api/security-incidents/meta/filters"),
      ]);
      setRows(data);
      setTypes(meta.incidentTypes);
      setLocations(meta.locations);
    } catch (e) {
      setRows([]);
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter && (r.incidentType ?? "") !== typeFilter) return false;
      if (locationFilter && (r.location ?? "") !== locationFilter) return false;
      if (statusFilter === "resolved" && !r.statusResolved) return false;
      if (statusFilter === "open" && r.statusResolved) return false;
      if (!inPeriod(r.incidentAt, periodFilter)) return false;
      return rowMatchesFilter(listFilter, [
        String(r.externalId),
        r.title,
        r.location,
        r.incidentType,
        r.damageValue,
        r.cause,
        r.details,
        r.reportingOfficer,
        r.createdBy,
        r.statusResolved ? "ปิดแล้ว" : "เปิด",
        formatThDateTime(r.incidentAt),
      ]);
    });
  }, [rows, listFilter, typeFilter, locationFilter, statusFilter, periodFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    setPage(1);
  }, [listFilter, typeFilter, locationFilter, statusFilter, periodFilter]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const periodButtons: { id: PeriodFilter; label: string }[] = [
    { id: "today", label: "วันนี้" },
    { id: "month", label: "เดือนนี้" },
    { id: "quarter", label: "ไตรมาสนี้" },
    { id: "year", label: "ปีนี้" },
  ];

  function togglePeriod(id: PeriodFilter) {
    setPeriodFilter((cur) => (cur === id ? "" : id));
  }

  return (
    <div>
      <PageHeaderBar
        title="เหตุการณ์ไม่ปกติ"
        count={filtered.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "เหตุการณ์ไม่ปกติ",
          placeholder: "ค้นหาชื่อ / สถานที่ / ประเภท…",
        }}
        extras={
          <div className="flex flex-wrap items-center gap-1.5">
            <div className={`${toolbarMasterGroupClass} !gap-0.5`}>
              {periodButtons.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => togglePeriod(b.id)}
                  className={`${toolbarMasterBtnClass} ${
                    periodFilter === b.id ? `${brandGradientFillClass} !text-white` : ""
                  }`}
                  aria-pressed={periodFilter === b.id}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <div className={toolbarMasterGroupClass}>
              <select
                className={`${toolbarLinkBtnClass} max-w-[10rem] truncate border-0 bg-transparent`}
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                aria-label="กรองสถานที่"
              >
                <option value="">สถานที่ทั้งหมด</option>
                {locations.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                className={`${toolbarLinkBtnClass} max-w-[12rem] truncate border-0 bg-transparent`}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="กรองประเภท"
              >
                <option value="">ประเภททั้งหมด</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                className={`${toolbarLinkBtnClass} border-0 bg-transparent`}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="กรองสถานะ"
              >
                <option value="">สถานะทั้งหมด</option>
                <option value="open">เปิด</option>
                <option value="resolved">ปิดแล้ว</option>
              </select>
            </div>
          </div>
        }
      />

      {err && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {err}
        </div>
      )}

      <p className="mt-2 text-xs text-slate-600">
        {loading
          ? "กำลังโหลด…"
          : `กรองแล้ว ${filtered.length.toLocaleString("th-TH")} จาก ${rows.length.toLocaleString("th-TH")} รายการ`}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="col-span-full rounded-xl border border-dashed border-[#dcd8f0] px-4 py-10 text-center text-slate-600">
            กำลังโหลด…
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-[#dcd8f0] px-4 py-10 text-center text-slate-600">
            ไม่พบรายการ
          </div>
        ) : (
          paged.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setDetail(r)}
              className={`${listCardClass} ${listCardAccentClass} text-left transition hover:border-[#0000BF]/35`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold text-[#66638c]">#{r.externalId}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    r.statusResolved ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-800"
                  }`}
                >
                  {r.statusResolved ? "ปิดแล้ว" : "เปิด"}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm font-bold text-[#1e1b4b]">{r.title}</p>
              <p className="mt-2 text-[11px] text-slate-600">
                {r.location || "—"} · {formatThDate(r.incidentAt)}
              </p>
              {r.incidentType ? (
                <p className="mt-1 line-clamp-1 text-[11px] font-medium text-[#4d47b6]">{r.incidentType}</p>
              ) : null}
            </button>
          ))
        )}
      </div>

      {!loading && filtered.length > 0 ? (
        <ListPagination
          page={safePage}
          pageCount={pageCount}
          total={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          className="print:hidden"
        />
      ) : null}

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `#${detail.externalId} · ${detail.title}` : "รายละเอียด"}
        size="wide"
      >
        {detail ? (
          <ModalFormBody>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">สถานที่</p>
                  <p className="mt-1 text-sm text-[#1e1b4b]">{detail.location || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">วันที่เกิดเหตุ</p>
                  <p className="mt-1 text-sm text-[#1e1b4b]">{formatThDateTime(detail.incidentAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">ประเภท</p>
                  <p className="mt-1 text-sm text-[#1e1b4b]">{detail.incidentType || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">สถานะ</p>
                  <p className="mt-1 text-sm text-[#1e1b4b]">{detail.statusResolved ? "ปิดแล้ว" : "เปิด"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">มูลค่าความเสียหาย</p>
                  <p className="mt-1 text-sm text-[#1e1b4b]">{detail.damageValue || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">ผู้รายงาน</p>
                  <p className="mt-1 text-sm text-[#1e1b4b]">{detail.reportingOfficer || detail.createdBy || "—"}</p>
                </div>
              </div>

              {parseListField(detail.impactLevel).length > 0 ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">ระดับผลกระทบ</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {parseListField(detail.impactLevel).map((x) => (
                      <span key={x} className="rounded-full bg-[#0000BF]/10 px-2 py-0.5 text-[11px] font-medium text-[#4d47b6]">
                        {x}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {parseListField(detail.impactTypes).length > 0 ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">ประเภทผลกระทบ</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {parseListField(detail.impactTypes).map((x) => (
                      <span key={x} className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                        {x}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <DetailBlock label="สาเหตุ" value={detail.cause} />
              <DetailBlock label="รายละเอียด" value={detail.details} />
              <DetailBlock label="การดำเนินการ" value={detail.actionExecuted} />
              <DetailBlock label="แนวทางป้องกัน" value={detail.preventiveSolutions} />
              <DetailBlock label="คำสั่งผู้บังคับบัญชา" value={detail.commanderOrder} />

              {detail.linkBotShare ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">ลิงก์เอกสาร</p>
                  <a
                    href={detail.linkBotShare}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 break-all text-sm font-medium text-[#0000BF] underline"
                  >
                    {detail.linkBotShare}
                  </a>
                </div>
              ) : null}
            </div>
          </ModalFormBody>
        ) : null}
      </Modal>
    </div>
  );
}

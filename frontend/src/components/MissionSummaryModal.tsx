import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Modal, ModalFormBody } from "./Modal";
import { formatBaht, formatInt, formatLiters } from "../lib/formatNumber";
import type { MissionStatus, MissionSummary } from "../types";
import { apiUrl } from "../api/client";

const statusLabel: Record<MissionStatus, string> = {
  DRAFT: "แบบร่าง",
  PLANNED: "วางแผน",
  IN_PROGRESS: "กำลังทำ",
  COMPLETED: "เสร็จแล้ว",
  CANCELLED: "ยกเลิก",
};

const statusChip: Record<MissionStatus, string> = {
  DRAFT: "bg-slate-500/15 text-slate-700",
  PLANNED: "bg-indigo-500/15 text-indigo-800",
  IN_PROGRESS: "bg-amber-500/15 text-amber-800",
  COMPLETED: "bg-emerald-500/15 text-emerald-800",
  CANCELLED: "bg-rose-500/15 text-rose-800",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("th-TH", { dateStyle: "medium" });
  } catch {
    return "—";
  }
}

function missionAttachmentHref(fileUrl: string): string {
  if (fileUrl.startsWith("http")) return fileUrl;
  return apiUrl(fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`);
}

type Props = {
  summary: MissionSummary;
  attachUploading: boolean;
  onClose: () => void;
  onUploadFiles: (files: File[]) => void;
  onDeleteAttachment: (id: string) => void;
};

export function MissionSummaryModal({
  summary,
  attachUploading,
  onClose,
  onUploadFiles,
  onDeleteAttachment,
}: Props) {
  const cargo = Number(summary.totalCargoValue ?? 0);
  const exp = Number(summary.totalExpenses ?? 0);
  const personnel = summary.personnel ?? [];
  const vehicles = summary.vehicles ?? [];
  const destinations = (summary.destinations ?? []).filter((d) => d.address.trim());
  const expenseEntries = Object.entries(summary.expensesByType).filter(([, v]) => Number(v) > 0);
  const status = summary.status ?? "PLANNED";

  const barData = [
    { name: "มูลค่าสินค้า", value: cargo, fill: "#6366f1" },
    { name: "รายจ่าย", value: exp, fill: "#14b8a6" },
  ];
  const pieData =
    cargo > 0
      ? exp <= cargo
        ? [
            { name: "รายจ่าย", value: exp },
            { name: "ส่วนต่างมูลค่า", value: cargo - exp },
          ]
        : [
            { name: "มูลค่าสินค้า", value: cargo },
            { name: "รายจ่ายเกิน", value: exp - cargo },
          ]
      : exp > 0
        ? [{ name: "รายจ่าย", value: exp }]
        : [];
  const pieColors = ["#14b8a6", "#818cf8", "#f59e0b"];

  return (
    <Modal open onClose={onClose} title="สรุปภารกิจ" size="wide" overlayZClass="z-[90]">
      <ModalFormBody className="!space-y-4">
        <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-teal-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {summary.code ? (
                <p className="font-mono text-xs font-bold tracking-wide text-indigo-600">{summary.code}</p>
              ) : null}
              <h3 className="mt-0.5 text-base font-black leading-snug text-slate-900">
                {summary.title?.trim() || "ภารกิจ"}
              </h3>
              {summary.route ? (
                <p className="mt-1 text-sm text-slate-600">
                  {summary.route.startLocation} → {summary.route.endLocation}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-slate-500">
                {formatDate(summary.plannedStart)} – {formatDate(summary.plannedEnd)}
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusChip[status]}`}>
              {statusLabel[status]}
            </span>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="มูลค่าสินค้า"
              value={`${formatBaht(summary.totalCargoValue)} ฿`}
              tone="from-indigo-500 to-violet-600"
            />
            <StatCard
              label="รวมรายจ่าย"
              value={`${formatBaht(summary.totalExpenses)} ฿`}
              tone="from-teal-500 to-emerald-600"
            />
            <StatCard
              label="รายจ่าย / มูลค่า"
              value={
                summary.expenseToCargoPercent != null
                  ? `${summary.expenseToCargoPercent.toLocaleString("th-TH", { maximumFractionDigits: 2 })}%`
                  : "—"
              }
              tone="from-amber-500 to-orange-600"
            />
            <StatCard
              label="ค่าตอบแทนบุคลากร"
              value={`${formatBaht(summary.personnelCompensationTotal ?? 0)} ฿`}
              tone="from-fuchsia-500 to-pink-600"
            />
          </div>
          {summary.budgetAmount != null && summary.budgetAmount !== "" ? (
            <p className="mt-2 text-xs text-slate-600">
              งบประมาณ {formatBaht(summary.budgetAmount)} ฿
              {summary.variance != null ? (
                <span className={summary.overBudget ? " text-rose-600" : " text-emerald-700"}>
                  {" "}
                  · คงเหลือ/เกิน {formatBaht(summary.variance)} ฿
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        {destinations.length > 0 ? (
          <Section title="จุดส่งสินค้า" accent="border-indigo-100">
            <ul className="divide-y divide-indigo-50/80">
              {destinations.map((d, i) => (
                <li
                  key={`${d.address}-${i}`}
                  className="flex items-center justify-between gap-2 py-1 text-xs"
                  title={
                    Number(d.cargoValue) > 0
                      ? `${d.address} · ${formatInt(d.containerCount)} ตู้ · ${formatBaht(d.cargoValue)} ฿`
                      : `${d.address} · ${formatInt(d.containerCount)} ตู้`
                  }
                >
                  <span className="min-w-0 truncate font-semibold text-slate-800">{d.address}</span>
                  <span className="shrink-0 tabular-nums text-slate-600">
                    {formatInt(d.containerCount)} ตู้
                    {Number(d.cargoValue) > 0 ? (
                      <span className="ml-1.5 font-medium text-indigo-700">{formatBaht(d.cargoValue)} ฿</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {personnel.length > 0 ? (
          <Section title={`บุคลากร (${personnel.length})`} accent="border-fuchsia-100">
            <ul className="max-h-40 divide-y divide-fuchsia-50 overflow-y-auto">
              {personnel.map((p) => {
                const name = [p.rank, p.fullName].filter(Boolean).join(" ");
                return (
                  <li key={p.personnelId}>
                    <div className="flex items-center gap-2 py-1 text-xs">
                      <Link
                        to={`/personnel?highlight=${p.personnelId}`}
                        title={`${name} · ${p.roleName}`}
                        className="min-w-0 flex-1 truncate font-semibold text-fuchsia-800 hover:underline"
                        onClick={onClose}
                      >
                        {name}
                        <span className="ml-1.5 font-normal text-slate-500">· {p.roleName}</span>
                      </Link>
                      <span className="shrink-0 tabular-nums font-bold text-fuchsia-700">
                        {formatBaht(p.compensationRate)} ฿
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}

        {vehicles.length > 0 ? (
          <Section title={`ยานพาหนะ (${vehicles.length})`} accent="border-teal-100">
            <ul className="max-h-36 divide-y divide-teal-50 overflow-y-auto">
              {vehicles.map((v) => {
                const fuel =
                  (v.fuelType === "DIESEL" ? "ดีเซล" : v.fuelType === "GASOLINE" ? "เบนซิน" : "—") +
                  (v.fuelLiters ? ` · ${formatLiters(v.fuelLiters)} ล.` : "");
                return (
                  <li
                    key={v.vehicleId}
                    className="flex items-center gap-2 py-1 text-xs"
                    title={`${v.licensePlate} · ${v.roleName} · ${fuel}`}
                  >
                    <p className="min-w-0 flex-1 truncate font-semibold text-teal-900">
                      {v.licensePlate}
                      <span className="ml-1.5 font-normal text-slate-500">· {v.roleName}</span>
                    </p>
                    <span className="shrink-0 tabular-nums text-teal-800">{fuel}</span>
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}

        {expenseEntries.length > 0 ? (
          <Section title="ค่าใช้จ่ายตามประเภท" accent="border-amber-100">
            <ul className="max-h-36 divide-y divide-amber-50 overflow-y-auto text-xs">
              {expenseEntries.map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-2 py-1">
                  <span className="min-w-0 truncate text-slate-700" title={k}>
                    {k}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-amber-800">{formatBaht(v)} ฿</span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <div className="grid gap-3 border-t border-slate-200 pt-3 lg:grid-cols-2">
          <div className="h-44 rounded-xl border border-slate-200 bg-white p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={(v) => formatInt(v)} />
                <Tooltip
                  formatter={(value) => [`${formatBaht(Number(value ?? 0))} ฿`, ""]}
                  contentStyle={{ borderRadius: 12, borderColor: "#c7d2fe" }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {barData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {pieData.length > 0 ? (
            <div className="h-44 rounded-xl border border-slate-200 bg-white p-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={68}
                    paddingAngle={2}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatBaht(Number(value ?? 0))}
                    contentStyle={{ borderRadius: 12, borderColor: "#c7d2fe" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">ไฟล์แนบ</p>
          <input
            type="file"
            multiple
            className="max-w-full text-xs text-slate-700 file:mr-2 file:rounded file:border-0 file:bg-indigo-100 file:px-2 file:py-1 file:text-indigo-900"
            disabled={attachUploading}
            onChange={(e) => {
              const input = e.target;
              const files = input.files?.length ? Array.from(input.files) : [];
              input.value = "";
              if (files.length) onUploadFiles(files);
            }}
          />
          {attachUploading ? <p className="text-xs text-indigo-600">กำลังอัปโหลด…</p> : null}
          {(summary.attachments ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">ยังไม่มีไฟล์แนบ</p>
          ) : (
            <ul className="max-h-28 space-y-1 overflow-y-auto text-sm">
              {(summary.attachments ?? []).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <a
                    href={missionAttachmentHref(a.fileUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-indigo-600 hover:underline"
                  >
                    {a.originalName?.trim() || "เปิดไฟล์"}
                  </a>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-rose-600 hover:underline"
                    onClick={() => onDeleteAttachment(a.id)}
                  >
                    ลบ
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-teal-600 py-2.5 text-sm font-bold text-white shadow-md hover:opacity-95"
          onClick={onClose}
        >
          ปิด
        </button>
      </ModalFormBody>
    </Modal>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-xl bg-gradient-to-br ${tone} p-3 text-white shadow-sm`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/80">{label}</p>
      <p className="mt-0.5 text-sm font-black tabular-nums sm:text-base">{value}</p>
    </div>
  );
}

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-lg border ${accent} bg-white/90 px-2.5 py-2`}>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">{title}</p>
      {children}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api/client";
import { Modal } from "./Modal";
import type { MissionYearDetailsResponse, MissionYearMissionDetail, MissionYearVehicleDetail } from "../types";

export type DashboardStatKind =
  | "cargo"
  | "operating"
  | "truck"
  | "containers"
  | "missions"
  | "gasoline"
  | "diesel"
  | "maintenance";

type VehicleKindConfig = {
  view: "vehicle";
  title: string;
  unit: string;
  countLabel: string;
  color: string;
  pick: (d: MissionYearDetailsResponse) => MissionYearVehicleDetail[];
  digits: number;
};

type MissionKindConfig = {
  view: "mission";
  title: string;
  unit: string;
  color: string;
  value: ((m: MissionYearMissionDetail) => number) | null;
  digits: number;
};

const KIND_CONFIG: Record<DashboardStatKind, VehicleKindConfig | MissionKindConfig> = {
  cargo: { view: "mission", title: "มูลค่าทรัพย์สินรายภารกิจ", unit: "บาท", color: "#4d47b6", value: (m) => Number(m.cargoValue) || 0, digits: 2 },
  operating: { view: "mission", title: "ค่าใช้จ่ายภารกิจรายภารกิจ", unit: "บาท", color: "#ec4899", value: (m) => Number(m.operatingExpense) || 0, digits: 2 },
  truck: { view: "mission", title: "ค่าจ้างรถบรรทุกสินค้ารายภารกิจ", unit: "บาท", color: "#059669", value: (m) => Number(m.truckHire) || 0, digits: 2 },
  containers: { view: "mission", title: "จำนวนตู้รายภารกิจ", unit: "ใบ", color: "#d97706", value: (m) => m.containers, digits: 0 },
  missions: { view: "mission", title: "รายการภารกิจ", unit: "", color: "#1e1b4b", value: null, digits: 0 },
  gasoline: { view: "vehicle", title: "น้ำมันเบนซินรายคัน", unit: "ลิตร", countLabel: "ภารกิจ", color: "#8b5cf6", pick: (d) => d.fuelGasoline, digits: 3 },
  diesel: { view: "vehicle", title: "น้ำมันดีเซลรายคัน", unit: "ลิตร", countLabel: "ภารกิจ", color: "#0000BF", pick: (d) => d.fuelDiesel, digits: 3 },
  maintenance: { view: "vehicle", title: "บำรุงรถรายคัน", unit: "บาท", countLabel: "ครั้ง", color: "#7c3aed", pick: (d) => d.maintenance, digits: 2 },
};

const fmt = (n: number, digits: number) => n.toLocaleString("th-TH", { maximumFractionDigits: digits });

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

function VehicleThumb({ url }: { url: string | null }) {
  const [broken, setBroken] = useState(false);
  return url && !broken ? (
    <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} className="h-12 w-16 shrink-0 rounded-lg object-cover" />
  ) : (
    <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[9px] font-semibold text-slate-400">
      ไม่มีรูป
    </span>
  );
}

function VehicleList({ rows, cfg }: { rows: MissionYearVehicleDetail[]; cfg: VehicleKindConfig }) {
  const values = rows.map((r) => Number(r.amount) || 0);
  const total = values.reduce((s, v) => s + v, 0);
  const max = Math.max(0, ...values);
  if (!rows.length) return <p className="py-8 text-center text-sm text-slate-500">ไม่มีข้อมูลในปีนี้</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        รวม <span className="font-black tabular-nums" style={{ color: cfg.color }}>{fmt(total, cfg.digits)}</span> {cfg.unit} ·{" "}
        {rows.length} คัน
      </p>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {rows.map((r, i) => {
          const v = values[i];
          return (
            <li key={r.vehicleId} className="flex items-center gap-3 px-3 py-2">
              <span className="w-5 shrink-0 text-right text-xs font-bold tabular-nums text-slate-400">{i + 1}</span>
              <VehicleThumb url={r.photoUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-black text-[#4d47b6]">{r.licensePlate}</p>
                <p className="truncate text-[11px] text-slate-500">
                  {r.brandModel || "—"} · {r.count.toLocaleString("th-TH")} {cfg.countLabel}
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${max > 0 ? (v / max) * 100 : 0}%`, backgroundColor: cfg.color }} />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-black tabular-nums" style={{ color: cfg.color }}>
                  {fmt(v, cfg.digits)}
                </p>
                <p className="text-[10px] text-slate-500">
                  {cfg.unit} · {total > 0 ? fmt((v / total) * 100, 1) : 0}%
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MissionList({ rows, cfg }: { rows: MissionYearMissionDetail[]; cfg: MissionKindConfig }) {
  const sorted = useMemo(() => {
    if (!cfg.value) return rows;
    const get = cfg.value;
    return [...rows].filter((m) => get(m) > 0).sort((a, b) => get(b) - get(a));
  }, [rows, cfg]);
  const total = cfg.value ? sorted.reduce((s, m) => s + cfg.value!(m), 0) : 0;
  if (!sorted.length) return <p className="py-8 text-center text-sm text-slate-500">ไม่มีข้อมูลในปีนี้</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {cfg.value ? (
          <>
            รวม <span className="font-black tabular-nums" style={{ color: cfg.color }}>{fmt(total, cfg.digits)}</span> {cfg.unit} ·{" "}
          </>
        ) : null}
        {sorted.length} ภารกิจ
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] text-slate-600">
            <tr>
              <th className="px-2 py-2 font-bold">วันที่</th>
              <th className="px-2 py-2 font-bold">ภารกิจ</th>
              <th className="px-2 py-2 font-bold">พื้นที่</th>
              {cfg.value ? (
                <th className="px-2 py-2 text-right font-bold">{cfg.unit ? `${cfg.unit}` : "ค่า"}</th>
              ) : (
                <>
                  <th className="px-2 py-2 text-right font-bold">ทรัพย์สิน (บาท)</th>
                  <th className="px-2 py-2 text-right font-bold">ตู้</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50/70">
                <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-600">{formatDate(m.plannedStart)}</td>
                <td className="px-2 py-1.5">
                  <Link to={`/missions/${m.id}/edit`} className="font-bold text-[#4d47b6] hover:underline">
                    {m.code || m.title || "—"}
                  </Link>
                  {m.route ? <p className="text-[10.5px] text-slate-500">{m.route}</p> : null}
                </td>
                <td className="px-2 py-1.5 text-slate-600">{m.areas.join(", ") || "—"}</td>
                {cfg.value ? (
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-bold tabular-nums" style={{ color: cfg.color }}>
                    {fmt(cfg.value(m), cfg.digits)}
                  </td>
                ) : (
                  <>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{fmt(Number(m.cargoValue) || 0, 2)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{m.containers}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DashboardStatDetailModal({
  kind,
  year,
  onClose,
}: {
  kind: DashboardStatKind | null;
  year: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<MissionYearDetailsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!kind || data?.year === year) return;
    let cancelled = false;
    setErr(null);
    apiJson<MissionYearDetailsResponse>(`/api/missions/stats/year/details?year=${year}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "โหลดรายละเอียดไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [kind, year, data?.year]);

  if (!kind) return null;
  const cfg = KIND_CONFIG[kind];
  const ready = data?.year === year;

  return (
    <Modal open onClose={onClose} title={`${cfg.title} — พ.ศ. ${year + 543}`} size={cfg.view === "mission" ? "wide" : "form"}>
      {err ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>
      ) : !ready ? (
        <p className="py-8 text-center text-sm text-slate-500">กำลังโหลด…</p>
      ) : cfg.view === "vehicle" ? (
        <VehicleList rows={cfg.pick(data)} cfg={cfg} />
      ) : (
        <MissionList rows={data.missions} cfg={cfg} />
      )}
    </Modal>
  );
}

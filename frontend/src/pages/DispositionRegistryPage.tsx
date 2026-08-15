import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api/client";
import { Modal, ModalFormBody } from "../components/Modal";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { useAuth } from "../context/AuthContext";
import { rowMatchesFilter } from "../lib/searchNormalize";
import {
  brandGradientFillClass,
  toolbarLinkBtnClass,
  toolbarMasterBtnClass,
  toolbarMasterGroupClass,
} from "../lib/uiTokens";
import type {
  Asset,
  AssetDispositionLogEntry,
  Vehicle,
  VehicleDispositionLogEntry,
} from "../types";
import { vehicleDisplayLabel } from "../types";

type Tab = "vehicles" | "assets";

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

function dispositionKindLabel(k: string) {
  if (k === "RETURNED") return "ส่งคืน";
  return "จำหน่าย";
}

function KindBadge({ kind }: { kind: string }) {
  const returned = kind === "RETURNED";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${
        returned
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
      }`}
    >
      {dispositionKindLabel(kind)}
    </span>
  );
}

function vehiclePhotos(v: Vehicle) {
  return (v.documents ?? []).filter((d) => d.kind === "PHOTO");
}

async function loadJson<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const data = await apiJson<T>(path);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" };
  }
}

const tableShell =
  "overflow-hidden rounded-[1.25rem] border border-[#e8e6fc]/90 bg-white/75 shadow-[0_12px_36px_-24px_rgba(30,27,75,0.28)]";
const theadClass = "border-b border-[#e8e6fc] bg-gradient-to-r from-[#f5f3ff]/95 via-white/90 to-[#fdf2f8]/80 text-[11px] font-bold uppercase tracking-wide text-[#66638c]";
const rowClass =
  "cursor-pointer border-b border-[#ecebff] last:border-0 bg-white/50 transition hover:bg-[#0000BF]/[0.04]";
const errBox = "mb-3 whitespace-pre-wrap rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700";
const dangerBtn =
  "inline-flex h-8 items-center rounded-xl border border-rose-200 bg-white px-2.5 text-[11px] font-bold text-rose-600 shadow-sm hover:bg-rose-50";
const softBtn =
  "inline-flex h-8 items-center rounded-xl border border-[#dcd8f0] bg-white px-2.5 text-[11px] font-bold text-[#2e2a58] shadow-sm hover:border-[#0000BF]/25 hover:bg-[#0000BF]/5";
const primarySoftBtn =
  "inline-flex h-8 items-center rounded-xl border border-[#0000BF]/25 bg-[#0000BF]/8 px-2.5 text-[11px] font-bold text-[#4d47b6] hover:bg-[#0000BF]/12";

export function DispositionRegistryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [tab, setTab] = useState<Tab>("vehicles");
  const [listFilter, setListFilter] = useState("");
  const [vehiclesRetired, setVehiclesRetired] = useState<Vehicle[]>([]);
  const [vehicleLog, setVehicleLog] = useState<VehicleDispositionLogEntry[]>([]);
  const [assetsRetired, setAssetsRetired] = useState<Asset[]>([]);
  const [assetLog, setAssetLog] = useState<AssetDispositionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errVehiclesRetired, setErrVehiclesRetired] = useState<string | null>(null);
  const [errVehicleLog, setErrVehicleLog] = useState<string | null>(null);
  const [errAssetsRetired, setErrAssetsRetired] = useState<string | null>(null);
  const [errAssetLog, setErrAssetLog] = useState<string | null>(null);

  const [vehicleEntity, setVehicleEntity] = useState<Vehicle | null>(null);
  const [vehicleLogRow, setVehicleLogRow] = useState<VehicleDispositionLogEntry | null>(null);
  const [assetEntity, setAssetEntity] = useState<Asset | null>(null);
  const [assetLogRow, setAssetLogRow] = useState<AssetDispositionLogEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrVehiclesRetired(null);
    setErrVehicleLog(null);
    setErrAssetsRetired(null);
    setErrAssetLog(null);
    const [vr, vl, ar, al] = await Promise.all([
      loadJson<Vehicle[]>("/api/vehicles/registry/retired"),
      loadJson<VehicleDispositionLogEntry[]>("/api/vehicles/registry/disposition-log"),
      loadJson<Asset[]>("/api/assets/registry/retired"),
      loadJson<AssetDispositionLogEntry[]>("/api/assets/registry/disposition-log"),
    ]);
    setVehiclesRetired(vr.ok ? vr.data : []);
    setErrVehiclesRetired(vr.ok ? null : vr.message);
    setVehicleLog(vl.ok ? vl.data : []);
    setErrVehicleLog(vl.ok ? null : vl.message);
    setAssetsRetired(ar.ok ? ar.data : []);
    setErrAssetsRetired(ar.ok ? null : ar.message);
    setAssetLog(al.ok ? al.data : []);
    setErrAssetLog(al.ok ? null : al.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredVehiclesRetired = useMemo(
    () =>
      vehiclesRetired.filter((v) =>
        rowMatchesFilter(listFilter, [v.licensePlate, vehicleDisplayLabel(v), v.vehicleStatus?.name, v.assetCode]),
      ),
    [vehiclesRetired, listFilter],
  );

  const filteredVehicleLog = useMemo(
    () =>
      vehicleLog.filter((row) =>
        rowMatchesFilter(listFilter, [
          row.licensePlate,
          row.brandModel,
          row.statusName,
          row.note,
          dispositionKindLabel(row.kind),
          formatThDateTime(row.recordedAt),
        ]),
      ),
    [vehicleLog, listFilter],
  );

  const filteredAssetsRetired = useMemo(
    () =>
      assetsRetired.filter((a) =>
        rowMatchesFilter(listFilter, [a.serialNumber, a.itemName, a.assetItemStatus?.name, a.location]),
      ),
    [assetsRetired, listFilter],
  );

  const filteredAssetLog = useMemo(
    () =>
      assetLog.filter((row) =>
        rowMatchesFilter(listFilter, [
          row.serialNumber,
          row.itemName,
          row.statusName,
          row.note,
          dispositionKindLabel(row.kind),
          formatThDateTime(row.recordedAt),
        ]),
      ),
    [assetLog, listFilter],
  );

  async function deleteVehicleEntity(v: Vehicle) {
    if (!isAdmin) return;
    if (!confirm(`ลบยานพาหนะทะเบียน «${v.licensePlate}» ? รูปและประวัติที่เกี่ยวข้องจะถูกลบด้วย`)) return;
    try {
      await apiJson(`/api/vehicles/${v.id}`, { method: "DELETE" });
      setVehicleEntity(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  async function deleteAssetEntity(a: Asset) {
    if (!isAdmin) return;
    if (!confirm(`ลบครุภัณฑ์ «${a.itemName}» (${a.serialNumber}) ?`)) return;
    try {
      await apiJson(`/api/assets/${a.id}`, { method: "DELETE" });
      setAssetEntity(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  async function deleteVehicleLogEntry(row: VehicleDispositionLogEntry) {
    if (!isAdmin) return;
    if (!confirm("ลบแถวประวัตินี้จากทะเบียน? (ข้อมูลรถไม่ถูกลบ)")) return;
    try {
      await apiJson(`/api/vehicles/registry/disposition-log/${row.id}`, { method: "DELETE" });
      setVehicleLogRow(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  async function deleteAssetLogEntry(row: AssetDispositionLogEntry) {
    if (!isAdmin) return;
    if (!confirm("ลบแถวประวัตินี้จากทะเบียน? (ข้อมูลครุภัณฑ์ไม่ถูกลบ)")) return;
    try {
      await apiJson(`/api/assets/registry/disposition-log/${row.id}`, { method: "DELETE" });
      setAssetLogRow(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  async function openVehicleById(vehicleId: string) {
    try {
      const v = await apiJson<Vehicle>(`/api/vehicles/${vehicleId}`);
      setVehicleEntity(v);
      setVehicleLogRow(null);
    } catch {
      alert("ไม่พบข้อมูลรถ (อาจถูกลบแล้ว)");
    }
  }

  async function openAssetById(assetId: string) {
    try {
      const a = await apiJson<Asset>(`/api/assets/${assetId}`);
      setAssetEntity(a);
      setAssetLogRow(null);
    } catch {
      alert("ไม่พบข้อมูลครุภัณฑ์ (อาจถูกลบแล้ว)");
    }
  }

  const summaryCards =
    tab === "vehicles"
      ? [
          { label: "นอกยอดตรวจ", value: vehiclesRetired.length, tone: "from-[#0000BF]/12 to-[#8b5cf6]/5" },
          { label: "ประวัติ", value: vehicleLog.length, tone: "from-[#ec4899]/12 to-[#8b5cf6]/5" },
        ]
      : [
          { label: "นอกยอดตรวจ", value: assetsRetired.length, tone: "from-[#0000BF]/12 to-[#8b5cf6]/5" },
          { label: "ประวัติ", value: assetLog.length, tone: "from-[#ec4899]/12 to-[#8b5cf6]/5" },
        ];

  return (
    <div>
      <PageHeaderBar
        title="ทะเบียนจำหน่าย / ส่งคืน"
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "ทะเบียนจำหน่าย / ส่งคืน",
          placeholder: "กรองทะเบียน / ชื่อ / สถานะ / หมายเหตุ…",
        }}
        segments={
          <div className={toolbarMasterGroupClass}>
            {(
              [
                ["vehicles", "ยานพาหนะ"],
                ["assets", "วัสดุทั่วไป"],
              ] as const
            ).map(([id, label]) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-black transition sm:h-9 sm:px-3 sm:text-xs ${
                    active ? `${brandGradientFillClass} text-white shadow-md` : toolbarMasterBtnClass
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        }
        extras={
          <>
            <Link to="/vehicles" className={toolbarLinkBtnClass}>
              หน้ารถ
            </Link>
            <Link to="/assets" className={toolbarLinkBtnClass}>
              หน้าวัสดุทั่วไป
            </Link>
            <button type="button" onClick={() => void load()} className={toolbarLinkBtnClass}>
              รีเฟรช
            </button>
          </>
        }
      />

      {!loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {summaryCards.map((c) => (
            <div
              key={c.label}
              className={`rounded-[1.25rem] border border-[#e8e6fc]/90 bg-gradient-to-br ${c.tone} px-4 py-3 shadow-[0_10px_30px_-20px_rgba(30,27,75,0.3)]`}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#66638c]">{c.label}</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-[#1e1b4b]">{c.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-6 text-center text-sm font-semibold text-[#66638c]">กำลังโหลด…</p>
      ) : null}

      {!loading && tab === "vehicles" ? (
        <div className="mt-6 space-y-5">
          <section className={tableShell}>
            <div className="flex items-center justify-between gap-2 border-b border-[#e8e6fc] px-4 py-3">
              <h2 className="text-sm font-black text-[#1e1b4b]">รายการปัจจุบัน</h2>
              <span className="rounded-full bg-[#0000BF]/10 px-2.5 py-0.5 text-[10px] font-black text-[#4d47b6]">
                {filteredVehiclesRetired.length}/{vehiclesRetired.length}
              </span>
            </div>
            {errVehiclesRetired ? <p className={`${errBox} m-3`}>{errVehiclesRetired}</p> : null}
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className={theadClass}>
                  <tr>
                    <th className="px-4 py-2.5">ทะเบียน</th>
                    <th className="px-4 py-2.5">ยี่ห้อ / รุ่น</th>
                    <th className="px-4 py-2.5">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVehiclesRetired.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                        {errVehiclesRetired ? "โหลดไม่สำเร็จ" : vehiclesRetired.length ? "ไม่ตรงกับการกรอง" : "ยังไม่มีรายการ"}
                      </td>
                    </tr>
                  ) : (
                    filteredVehiclesRetired.map((v) => (
                      <tr
                        key={v.id}
                        role="button"
                        tabIndex={0}
                        className={rowClass}
                        onClick={() => setVehicleEntity(v)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setVehicleEntity(v);
                          }
                        }}
                      >
                        <td className="px-4 py-2.5 font-mono text-sm font-bold text-[#4d47b6]">{v.licensePlate}</td>
                        <td className="px-4 py-2.5 text-slate-800">{vehicleDisplayLabel(v)}</td>
                        <td className="px-4 py-2.5 text-slate-600">{v.vehicleStatus?.name ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className={tableShell}>
            <div className="flex items-center justify-between gap-2 border-b border-[#e8e6fc] px-4 py-3">
              <h2 className="text-sm font-black text-[#1e1b4b]">ประวัติ</h2>
              <span className="rounded-full bg-[#ec4899]/10 px-2.5 py-0.5 text-[10px] font-black text-[#be185d]">
                {filteredVehicleLog.length}/{vehicleLog.length}
              </span>
            </div>
            {errVehicleLog ? <p className={`${errBox} m-3`}>{errVehicleLog}</p> : null}
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className={theadClass}>
                  <tr>
                    <th className="px-4 py-2.5">วันที่</th>
                    <th className="px-4 py-2.5">ประเภท</th>
                    <th className="px-4 py-2.5">ทะเบียน</th>
                    <th className="px-4 py-2.5">ยี่ห้อ / รุ่น</th>
                    <th className="px-4 py-2.5">สถานะ</th>
                    <th className="px-4 py-2.5">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVehicleLog.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        {errVehicleLog ? "โหลดไม่สำเร็จ" : vehicleLog.length ? "ไม่ตรงกับการกรอง" : "ยังไม่มีประวัติ"}
                      </td>
                    </tr>
                  ) : (
                    filteredVehicleLog.map((row) => (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        className={rowClass}
                        onClick={() => setVehicleLogRow(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setVehicleLogRow(row);
                          }
                        }}
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{formatThDateTime(row.recordedAt)}</td>
                        <td className="px-4 py-2.5">
                          <KindBadge kind={row.kind} />
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-[#4d47b6]">{row.licensePlate}</td>
                        <td className="px-4 py-2.5 text-slate-700">{row.brandModel}</td>
                        <td className="px-4 py-2.5 text-slate-600">{row.statusName}</td>
                        <td className="max-w-[12rem] truncate px-4 py-2.5 text-slate-500" title={row.note ?? ""}>
                          {row.note?.trim() || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {!loading && tab === "assets" ? (
        <div className="mt-6 space-y-5">
          <section className={tableShell}>
            <div className="flex items-center justify-between gap-2 border-b border-[#e8e6fc] px-4 py-3">
              <h2 className="text-sm font-black text-[#1e1b4b]">รายการปัจจุบัน</h2>
              <span className="rounded-full bg-[#0000BF]/10 px-2.5 py-0.5 text-[10px] font-black text-[#4d47b6]">
                {filteredAssetsRetired.length}/{assetsRetired.length}
              </span>
            </div>
            {errAssetsRetired ? <p className={`${errBox} m-3`}>{errAssetsRetired}</p> : null}
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className={theadClass}>
                  <tr>
                    <th className="px-4 py-2.5">เลขครุภัณฑ์</th>
                    <th className="px-4 py-2.5">ชื่อ</th>
                    <th className="px-4 py-2.5">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssetsRetired.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                        {errAssetsRetired ? "โหลดไม่สำเร็จ" : assetsRetired.length ? "ไม่ตรงกับการกรอง" : "ยังไม่มีรายการ"}
                      </td>
                    </tr>
                  ) : (
                    filteredAssetsRetired.map((a) => (
                      <tr
                        key={a.id}
                        role="button"
                        tabIndex={0}
                        className={rowClass}
                        onClick={() => setAssetEntity(a)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setAssetEntity(a);
                          }
                        }}
                      >
                        <td className="px-4 py-2.5 font-mono font-bold text-[#4d47b6]">{a.serialNumber}</td>
                        <td className="px-4 py-2.5 text-slate-800">{a.itemName}</td>
                        <td className="px-4 py-2.5 text-slate-600">{a.assetItemStatus?.name ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className={tableShell}>
            <div className="flex items-center justify-between gap-2 border-b border-[#e8e6fc] px-4 py-3">
              <h2 className="text-sm font-black text-[#1e1b4b]">ประวัติ</h2>
              <span className="rounded-full bg-[#ec4899]/10 px-2.5 py-0.5 text-[10px] font-black text-[#be185d]">
                {filteredAssetLog.length}/{assetLog.length}
              </span>
            </div>
            {errAssetLog ? <p className={`${errBox} m-3`}>{errAssetLog}</p> : null}
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className={theadClass}>
                  <tr>
                    <th className="px-4 py-2.5">วันที่</th>
                    <th className="px-4 py-2.5">ประเภท</th>
                    <th className="px-4 py-2.5">เลขครุภัณฑ์</th>
                    <th className="px-4 py-2.5">ชื่อ</th>
                    <th className="px-4 py-2.5">สถานะ</th>
                    <th className="px-4 py-2.5">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssetLog.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        {errAssetLog ? "โหลดไม่สำเร็จ" : assetLog.length ? "ไม่ตรงกับการกรอง" : "ยังไม่มีประวัติ"}
                      </td>
                    </tr>
                  ) : (
                    filteredAssetLog.map((row) => (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        className={rowClass}
                        onClick={() => setAssetLogRow(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setAssetLogRow(row);
                          }
                        }}
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{formatThDateTime(row.recordedAt)}</td>
                        <td className="px-4 py-2.5">
                          <KindBadge kind={row.kind} />
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-[#4d47b6]">{row.serialNumber}</td>
                        <td className="px-4 py-2.5 text-slate-700">{row.itemName}</td>
                        <td className="px-4 py-2.5 text-slate-600">{row.statusName}</td>
                        <td className="max-w-[12rem] truncate px-4 py-2.5 text-slate-500" title={row.note ?? ""}>
                          {row.note?.trim() || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      <Modal
        open={Boolean(vehicleEntity)}
        onClose={() => setVehicleEntity(null)}
        title={vehicleEntity ? `รถ ${vehicleEntity.licensePlate}` : "รายละเอียดรถ"}
        size="wide"
      >
        {vehicleEntity ? (
          <ModalFormBody>
            <div className="flex flex-wrap gap-1.5 border-b border-[#e8e6fc] pb-3">
              <Link
                to={`/vehicles?editVehicle=${vehicleEntity.id}`}
                onClick={() => setVehicleEntity(null)}
                className={primarySoftBtn}
              >
                แก้ไข
              </Link>
              <Link
                to={`/vehicles/${vehicleEntity.id}/maintenance`}
                onClick={() => setVehicleEntity(null)}
                className={softBtn}
              >
                บำรุงรักษา
              </Link>
              {isAdmin ? (
                <button type="button" className={dangerBtn} onClick={() => void deleteVehicleEntity(vehicleEntity)}>
                  ลบรถ
                </button>
              ) : null}
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">ยี่ห้อ / รุ่น</dt>
                <dd className="mt-0.5 font-semibold text-[#1e1b4b]">{vehicleDisplayLabel(vehicleEntity)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">สถานะ</dt>
                <dd className="mt-0.5 text-slate-800">{vehicleEntity.vehicleStatus?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">เลขครุภัณฑ์</dt>
                <dd className="mt-0.5 font-mono text-slate-700">{vehicleEntity.assetCode?.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">เลขไมล์</dt>
                <dd className="mt-0.5 tabular-nums text-slate-800">{vehicleEntity.currentMileage} km</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">หมายเหตุ</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-slate-700">{vehicleEntity.notes?.trim() || "—"}</dd>
              </div>
            </dl>
            {vehiclePhotos(vehicleEntity).length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-[#66638c]">รูปถ่าย</p>
                <div className="flex flex-wrap gap-2">
                  {vehiclePhotos(vehicleEntity).map((p) => (
                    <img
                      key={p.id}
                      src={p.fileUrl}
                      alt=""
                      className="h-20 w-20 rounded-xl border border-[#e8e6fc] object-cover shadow-sm"
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </ModalFormBody>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(vehicleLogRow)}
        onClose={() => setVehicleLogRow(null)}
        title="รายละเอียดประวัติ (รถ)"
        size="wide"
      >
        {vehicleLogRow ? (
          <ModalFormBody>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">วันที่บันทึก</dt>
                <dd className="mt-0.5 text-slate-800">{formatThDateTime(vehicleLogRow.recordedAt)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">ประเภท</dt>
                <dd className="mt-1">
                  <KindBadge kind={vehicleLogRow.kind} />
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">ทะเบียน</dt>
                <dd className="mt-0.5 font-mono font-bold text-[#4d47b6]">{vehicleLogRow.licensePlate}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">ยี่ห้อ/รุ่น</dt>
                <dd className="mt-0.5 text-slate-800">{vehicleLogRow.brandModel}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">สถานะ</dt>
                <dd className="mt-0.5 text-slate-800">{vehicleLogRow.statusName}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">หมายเหตุ</dt>
                <dd className="mt-0.5 text-slate-700">{vehicleLogRow.note?.trim() || "—"}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-[#e8e6fc] pt-4">
              {vehicleLogRow.vehicle?.id ? (
                <button
                  type="button"
                  className={primarySoftBtn}
                  onClick={() => void openVehicleById(vehicleLogRow.vehicle!.id)}
                >
                  ดูรถปัจจุบัน
                </button>
              ) : (
                <p className="text-xs text-slate-500">ไม่พบการเชื่อมกับรถในระบบ</p>
              )}
              <Link
                to={`/vehicles?editVehicle=${vehicleLogRow.vehicleId}`}
                onClick={() => setVehicleLogRow(null)}
                className={softBtn}
              >
                แก้ไข
              </Link>
              {isAdmin ? (
                <button type="button" className={dangerBtn} onClick={() => void deleteVehicleLogEntry(vehicleLogRow)}>
                  ลบประวัติ
                </button>
              ) : null}
            </div>
          </ModalFormBody>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(assetEntity)}
        onClose={() => setAssetEntity(null)}
        title={assetEntity ? assetEntity.itemName : "รายละเอียดครุภัณฑ์"}
        size="wide"
      >
        {assetEntity ? (
          <ModalFormBody>
            <div className="flex flex-wrap gap-1.5 border-b border-[#e8e6fc] pb-3">
              <Link
                to={`/assets?editAsset=${assetEntity.id}`}
                onClick={() => setAssetEntity(null)}
                className={primarySoftBtn}
              >
                แก้ไข
              </Link>
              {isAdmin ? (
                <button type="button" className={dangerBtn} onClick={() => void deleteAssetEntity(assetEntity)}>
                  ลบครุภัณฑ์
                </button>
              ) : null}
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">เลขครุภัณฑ์</dt>
                <dd className="mt-0.5 font-mono font-bold text-[#4d47b6]">{assetEntity.serialNumber}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">สถานะ</dt>
                <dd className="mt-0.5 text-slate-800">{assetEntity.assetItemStatus?.name ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">ที่ตั้ง</dt>
                <dd className="mt-0.5 text-slate-800">{assetEntity.location}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">หมายเหตุ</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-slate-700">{assetEntity.notes?.trim() || "—"}</dd>
              </div>
            </dl>
          </ModalFormBody>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(assetLogRow)}
        onClose={() => setAssetLogRow(null)}
        title="รายละเอียดประวัติ (ครุภัณฑ์)"
        size="wide"
      >
        {assetLogRow ? (
          <ModalFormBody>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">วันที่บันทึก</dt>
                <dd className="mt-0.5 text-slate-800">{formatThDateTime(assetLogRow.recordedAt)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">ประเภท</dt>
                <dd className="mt-1">
                  <KindBadge kind={assetLogRow.kind} />
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">เลขครุภัณฑ์</dt>
                <dd className="mt-0.5 font-mono font-bold text-[#4d47b6]">{assetLogRow.serialNumber}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">ชื่อ</dt>
                <dd className="mt-0.5 text-slate-800">{assetLogRow.itemName}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">สถานะ</dt>
                <dd className="mt-0.5 text-slate-800">{assetLogRow.statusName}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-black uppercase tracking-wide text-[#66638c]">หมายเหตุ</dt>
                <dd className="mt-0.5 text-slate-700">{assetLogRow.note?.trim() || "—"}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-[#e8e6fc] pt-4">
              {assetLogRow.asset?.id ? (
                <button
                  type="button"
                  className={primarySoftBtn}
                  onClick={() => void openAssetById(assetLogRow.asset!.id)}
                >
                  ดูครุภัณฑ์ปัจจุบัน
                </button>
              ) : (
                <p className="text-xs text-slate-500">ไม่พบการเชื่อมกับครุภัณฑ์ในระบบ</p>
              )}
              <Link
                to={`/assets?editAsset=${assetLogRow.assetId}`}
                onClick={() => setAssetLogRow(null)}
                className={softBtn}
              >
                แก้ไข
              </Link>
              {isAdmin ? (
                <button type="button" className={dangerBtn} onClick={() => void deleteAssetLogEntry(assetLogRow)}>
                  ลบประวัติ
                </button>
              ) : null}
            </div>
          </ModalFormBody>
        ) : null}
      </Modal>
    </div>
  );
}

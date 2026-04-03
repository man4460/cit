import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../api/client";
import { Modal, ModalFormBody } from "../components/Modal";
import { useAuth } from "../context/AuthContext";
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

export function DispositionRegistryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [tab, setTab] = useState<Tab>("vehicles");
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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">ทะเบียนจำหน่าย / ส่งคืน</h1>
          <p className="mt-1 max-w-3xl text-slate-400">
            คลิกแถวเพื่อดูรายละเอียด — แก้ไขจากหน้าหลัก (ยานพาหนะ / ครุภัณฑ์) ผ่านปุ่ม «แก้ไข» การลบรถ ครุภัณฑ์ หรือแถวประวัติ ใช้ได้เฉพาะบัญชี{" "}
            <span className="text-amber-200/90">Admin</span> เท่านั้น
          </p>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            รายการหลักที่หน้า{" "}
            <Link to="/vehicles" className="text-teal-400 hover:underline">
              ยานพาหนะ
            </Link>{" "}
            และ{" "}
            <Link to="/assets" className="text-teal-400 hover:underline">
              ครุภัณฑ์
            </Link>{" "}
            ไม่รวมรายการที่ออกจากยอดตรวจ
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          รีเฟรช
        </button>
      </div>

      <div className="mb-4 flex gap-1 rounded-lg border border-slate-800 bg-slate-900/50 p-1">
        {(
          [
            ["vehicles", "ยานพาหนะ"],
            ["assets", "ครุภัณฑ์"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === id ? "bg-teal-600/25 text-teal-200" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? <p className="text-slate-500">กำลังโหลด…</p> : null}

      {!loading && tab === "vehicles" ? (
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 text-lg font-semibold text-white">รายการปัจจุบัน (นอกยอดตรวจ)</h2>
            <p className="mb-3 text-xs text-slate-500">{vehiclesRetired.length} คัน</p>
            {errVehiclesRetired ? (
              <p className="mb-3 whitespace-pre-wrap rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-sm text-rose-300">
                {errVehiclesRetired}
              </p>
            ) : null}
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-900/80 text-xs text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">ทะเบียน</th>
                    <th className="px-3 py-2 font-medium">ยี่ห้อ / รุ่น</th>
                    <th className="px-3 py-2 font-medium">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {vehiclesRetired.length === 0 && !errVehiclesRetired ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                        ไม่มีรายการ — ยังไม่มีรถที่ตั้งสถานะเป็น «ไม่นับในยอดตรวจ»
                      </td>
                    </tr>
                  ) : vehiclesRetired.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-slate-600">
                        โหลดไม่สำเร็จ
                      </td>
                    </tr>
                  ) : (
                    vehiclesRetired.map((v) => (
                      <tr
                        key={v.id}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer bg-slate-950/40 hover:bg-slate-800/50"
                        onClick={() => setVehicleEntity(v)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setVehicleEntity(v);
                          }
                        }}
                      >
                        <td className="px-3 py-2 font-mono text-teal-300/90">{v.licensePlate}</td>
                        <td className="px-3 py-2 text-slate-200">{vehicleDisplayLabel(v)}</td>
                        <td className="px-3 py-2 text-slate-300">{v.vehicleStatus?.name ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-white">ประวัติ</h2>
            <p className="mb-3 text-xs text-slate-500">{vehicleLog.length} รายการ</p>
            {errVehicleLog ? (
              <p className="mb-3 whitespace-pre-wrap rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-sm text-rose-300">
                {errVehicleLog}
              </p>
            ) : null}
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-900/80 text-xs text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">วันที่</th>
                    <th className="px-3 py-2 font-medium">ประเภท</th>
                    <th className="px-3 py-2 font-medium">ทะเบียน</th>
                    <th className="px-3 py-2 font-medium">ยี่ห้อ / รุ่น (snapshot)</th>
                    <th className="px-3 py-2 font-medium">สถานะ (snapshot)</th>
                    <th className="px-3 py-2 font-medium">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {vehicleLog.length === 0 && !errVehicleLog ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                        ยังไม่มีประวัติ
                      </td>
                    </tr>
                  ) : vehicleLog.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-600">
                        โหลดไม่สำเร็จ
                      </td>
                    </tr>
                  ) : (
                    vehicleLog.map((row) => (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer bg-slate-950/40 hover:bg-slate-800/50"
                        onClick={() => setVehicleLogRow(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setVehicleLogRow(row);
                          }
                        }}
                      >
                        <td className="whitespace-nowrap px-3 py-2 text-slate-400">{formatThDateTime(row.recordedAt)}</td>
                        <td className="px-3 py-2 text-slate-200">{dispositionKindLabel(row.kind)}</td>
                        <td className="px-3 py-2 font-mono text-teal-300/90">{row.licensePlate}</td>
                        <td className="px-3 py-2 text-slate-300">{row.brandModel}</td>
                        <td className="px-3 py-2 text-slate-300">{row.statusName}</td>
                        <td className="max-w-xs truncate px-3 py-2 text-slate-500" title={row.note ?? ""}>
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
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 text-lg font-semibold text-white">รายการปัจจุบัน (นอกยอดตรวจ)</h2>
            <p className="mb-3 text-xs text-slate-500">{assetsRetired.length} รายการ</p>
            {errAssetsRetired ? (
              <p className="mb-3 whitespace-pre-wrap rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-sm text-rose-300">
                {errAssetsRetired}
              </p>
            ) : null}
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-900/80 text-xs text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">เลขครุภัณฑ์</th>
                    <th className="px-3 py-2 font-medium">ชื่อ</th>
                    <th className="px-3 py-2 font-medium">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {assetsRetired.length === 0 && !errAssetsRetired ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                        ไม่มีรายการ
                      </td>
                    </tr>
                  ) : assetsRetired.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-slate-600">
                        โหลดไม่สำเร็จ
                      </td>
                    </tr>
                  ) : (
                    assetsRetired.map((a) => (
                      <tr
                        key={a.id}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer bg-slate-950/40 hover:bg-slate-800/50"
                        onClick={() => setAssetEntity(a)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setAssetEntity(a);
                          }
                        }}
                      >
                        <td className="px-3 py-2 font-mono text-teal-300/90">{a.serialNumber}</td>
                        <td className="px-3 py-2 text-slate-200">{a.itemName}</td>
                        <td className="px-3 py-2 text-slate-300">{a.assetItemStatus?.name ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-white">ประวัติ</h2>
            <p className="mb-3 text-xs text-slate-500">{assetLog.length} รายการ</p>
            {errAssetLog ? (
              <p className="mb-3 whitespace-pre-wrap rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-sm text-rose-300">
                {errAssetLog}
              </p>
            ) : null}
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-900/80 text-xs text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">วันที่</th>
                    <th className="px-3 py-2 font-medium">ประเภท</th>
                    <th className="px-3 py-2 font-medium">เลขครุภัณฑ์</th>
                    <th className="px-3 py-2 font-medium">ชื่อ (snapshot)</th>
                    <th className="px-3 py-2 font-medium">สถานะ (snapshot)</th>
                    <th className="px-3 py-2 font-medium">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {assetLog.length === 0 && !errAssetLog ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                        ยังไม่มีประวัติ
                      </td>
                    </tr>
                  ) : assetLog.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-600">
                        โหลดไม่สำเร็จ
                      </td>
                    </tr>
                  ) : (
                    assetLog.map((row) => (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer bg-slate-950/40 hover:bg-slate-800/50"
                        onClick={() => setAssetLogRow(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setAssetLogRow(row);
                          }
                        }}
                      >
                        <td className="whitespace-nowrap px-3 py-2 text-slate-400">{formatThDateTime(row.recordedAt)}</td>
                        <td className="px-3 py-2 text-slate-200">{dispositionKindLabel(row.kind)}</td>
                        <td className="px-3 py-2 font-mono text-teal-300/90">{row.serialNumber}</td>
                        <td className="px-3 py-2 text-slate-300">{row.itemName}</td>
                        <td className="px-3 py-2 text-slate-300">{row.statusName}</td>
                        <td className="max-w-xs truncate px-3 py-2 text-slate-500" title={row.note ?? ""}>
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
            <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
              <Link
                to={`/vehicles?editVehicle=${vehicleEntity.id}`}
                onClick={() => setVehicleEntity(null)}
                className="rounded-lg border border-teal-700/60 bg-teal-950/30 px-3 py-1.5 text-xs font-medium text-teal-300 hover:bg-teal-900/40"
              >
                แก้ไข
              </Link>
              <Link
                to={`/vehicles/${vehicleEntity.id}/maintenance`}
                onClick={() => setVehicleEntity(null)}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                ประวัติบำรุงรักษา
              </Link>
              {isAdmin ? (
                <button
                  type="button"
                  className="rounded-lg border border-rose-800/60 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-950/40"
                  onClick={() => void deleteVehicleEntity(vehicleEntity)}
                >
                  ลบรายการรถ
                </button>
              ) : null}
            </div>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">ยี่ห้อ / รุ่น</dt>
                <dd className="text-slate-200">{vehicleDisplayLabel(vehicleEntity)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">สถานะ</dt>
                <dd className="text-slate-200">{vehicleEntity.vehicleStatus?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">เลขครุภัณฑ์</dt>
                <dd className="font-mono text-slate-300">{vehicleEntity.assetCode?.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">เลขไมล์</dt>
                <dd className="tabular-nums text-slate-200">{vehicleEntity.currentMileage} km</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">หมายเหตุ</dt>
                <dd className="whitespace-pre-wrap text-slate-400">{vehicleEntity.notes?.trim() || "—"}</dd>
              </div>
            </dl>
            {vehiclePhotos(vehicleEntity).length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-xs text-slate-500">รูปถ่าย</p>
                <div className="flex flex-wrap gap-2">
                  {vehiclePhotos(vehicleEntity).map((p) => (
                    <img key={p.id} src={p.fileUrl} alt="" className="h-20 w-20 rounded-lg border border-slate-700 object-cover" />
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
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">วันที่บันทึก</dt>
                <dd className="text-slate-200">{formatThDateTime(vehicleLogRow.recordedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">ประเภท</dt>
                <dd className="text-slate-200">{dispositionKindLabel(vehicleLogRow.kind)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">ทะเบียน (snapshot)</dt>
                <dd className="font-mono text-teal-300">{vehicleLogRow.licensePlate}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">ยี่ห้อ/รุ่น (snapshot)</dt>
                <dd className="text-slate-200">{vehicleLogRow.brandModel}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">สถานะ (snapshot)</dt>
                <dd className="text-slate-200">{vehicleLogRow.statusName}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">หมายเหตุ</dt>
                <dd className="text-slate-400">{vehicleLogRow.note?.trim() || "—"}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
              {vehicleLogRow.vehicle?.id ? (
                <button
                  type="button"
                  className="rounded-lg border border-teal-700/60 px-3 py-1.5 text-xs font-medium text-teal-300 hover:bg-slate-800"
                  onClick={() => void openVehicleById(vehicleLogRow.vehicle!.id)}
                >
                  ดูข้อมูลรถปัจจุบัน
                </button>
              ) : (
                <p className="text-xs text-slate-500">ไม่พบการเชื่อมกับรถในระบบ (อาจถูกลบแล้ว)</p>
              )}
              <Link
                to={`/vehicles?editVehicle=${vehicleLogRow.vehicleId}`}
                onClick={() => setVehicleLogRow(null)}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                แก้ไข (ตามรหัสรถ)
              </Link>
              {isAdmin ? (
                <button
                  type="button"
                  className="rounded-lg border border-rose-800/60 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-950/40"
                  onClick={() => void deleteVehicleLogEntry(vehicleLogRow)}
                >
                  ลบแถวประวัติ
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
            <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
              <Link
                to={`/assets?editAsset=${assetEntity.id}`}
                onClick={() => setAssetEntity(null)}
                className="rounded-lg border border-teal-700/60 bg-teal-950/30 px-3 py-1.5 text-xs font-medium text-teal-300 hover:bg-teal-900/40"
              >
                แก้ไข
              </Link>
              {isAdmin ? (
                <button
                  type="button"
                  className="rounded-lg border border-rose-800/60 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-950/40"
                  onClick={() => void deleteAssetEntity(assetEntity)}
                >
                  ลบรายการครุภัณฑ์
                </button>
              ) : null}
            </div>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">เลขครุภัณฑ์</dt>
                <dd className="font-mono text-teal-300">{assetEntity.serialNumber}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">สถานะ</dt>
                <dd className="text-slate-200">{assetEntity.assetItemStatus?.name ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">ที่ตั้ง</dt>
                <dd className="text-slate-200">{assetEntity.location}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">หมายเหตุ</dt>
                <dd className="whitespace-pre-wrap text-slate-400">{assetEntity.notes?.trim() || "—"}</dd>
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
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">วันที่บันทึก</dt>
                <dd className="text-slate-200">{formatThDateTime(assetLogRow.recordedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">ประเภท</dt>
                <dd className="text-slate-200">{dispositionKindLabel(assetLogRow.kind)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">เลขครุภัณฑ์ (snapshot)</dt>
                <dd className="font-mono text-teal-300">{assetLogRow.serialNumber}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">ชื่อ (snapshot)</dt>
                <dd className="text-slate-200">{assetLogRow.itemName}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">สถานะ (snapshot)</dt>
                <dd className="text-slate-200">{assetLogRow.statusName}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">หมายเหตุ</dt>
                <dd className="text-slate-400">{assetLogRow.note?.trim() || "—"}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
              {assetLogRow.asset?.id ? (
                <button
                  type="button"
                  className="rounded-lg border border-teal-700/60 px-3 py-1.5 text-xs font-medium text-teal-300 hover:bg-slate-800"
                  onClick={() => void openAssetById(assetLogRow.asset!.id)}
                >
                  ดูข้อมูลครุภัณฑ์ปัจจุบัน
                </button>
              ) : (
                <p className="text-xs text-slate-500">ไม่พบการเชื่อมกับครุภัณฑ์ในระบบ</p>
              )}
              <Link
                to={`/assets?editAsset=${assetLogRow.assetId}`}
                onClick={() => setAssetLogRow(null)}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                แก้ไข (ตามรหัสครุภัณฑ์)
              </Link>
              {isAdmin ? (
                <button
                  type="button"
                  className="rounded-lg border border-rose-800/60 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-950/40"
                  onClick={() => void deleteAssetLogEntry(assetLogRow)}
                >
                  ลบแถวประวัติ
                </button>
              ) : null}
            </div>
          </ModalFormBody>
        ) : null}
      </Modal>
    </div>
  );
}

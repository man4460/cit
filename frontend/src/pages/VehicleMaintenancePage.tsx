import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody } from "../components/Modal";
import { VehicleTypeMasterModal } from "../components/VehicleTypeMasterModal";
import type { MaintenanceLog, VehicleDetail } from "../types";
import { vehicleDisplayLabel } from "../types";
import { PageFilterPrintBar } from "../components/PageFilterPrintBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { formatVehiclePurchaseDateTh, vehicleAgeCompletedYears } from "../lib/vehicleAge";

function sumMaintenanceBaht(logs: MaintenanceLog[]) {
  return logs.reduce((a, log) => a + (Number(log.cost) || 0), 0);
}

function formatMaintenanceBaht(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function VehicleMaintenancePage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editLog, setEditLog] = useState<MaintenanceLog | null>(null);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [listFilter, setListFilter] = useState("");

  const [formDate, setFormDate] = useState("");
  const [formDetail, setFormDetail] = useState("");
  const [formCost, setFormCost] = useState("");

  const load = useCallback(async () => {
    if (!vehicleId) return;
    setErr(null);
    try {
      const v = await apiJson<VehicleDetail>(`/api/vehicles/${vehicleId}`);
      setVehicle(v);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
      setVehicle(null);
    }
  }, [vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredLogs = useMemo(
    () =>
      (vehicle?.maintenanceLogs ?? []).filter((log) =>
        rowMatchesFilter(listFilter, [
          log.detail,
          String(log.cost),
          new Date(log.date).toLocaleDateString("th-TH"),
        ]),
      ),
    [vehicle?.maintenanceLogs, listFilter],
  );

  function openAdd() {
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormDetail("");
    setFormCost("");
    setAddOpen(true);
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId) return;
    try {
      await apiJson(`/api/vehicles/${vehicleId}/maintenance`, {
        method: "POST",
        body: JSON.stringify({ date: formDate, detail: formDetail.trim(), cost: formCost }),
      });
      setAddOpen(false);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId || !editLog) return;
    try {
      await apiJson(`/api/vehicles/${vehicleId}/maintenance/${editLog.id}`, {
        method: "PUT",
        body: JSON.stringify({ date: formDate, detail: formDetail.trim(), cost: formCost }),
      });
      setEditLog(null);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function removeLog(log: MaintenanceLog) {
    if (!vehicleId || !confirm("ลบรายการนี้?")) return;
    try {
      await apiJson(`/api/vehicles/${vehicleId}/maintenance/${log.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  function startEdit(log: MaintenanceLog) {
    setFormDate(log.date.slice(0, 10));
    setFormDetail(log.detail);
    setFormCost(String(log.cost));
    setEditLog(log);
  }

  if (!vehicleId) {
    return <p className="text-slate-500">ไม่พบรถ</p>;
  }

  if (err && !vehicle) {
    return (
      <div>
        <p className="text-rose-400">{err}</p>
        <Link to="/vehicles" className="mt-4 inline-block text-teal-400 hover:underline">
          ← กลับรายการยานพาหนะ
        </Link>
      </div>
    );
  }

  if (!vehicle) {
    return <p className="text-slate-500">กำลังโหลด…</p>;
  }

  const label = vehicleDisplayLabel(vehicle);
  const vehicleAgeYears = vehicleAgeCompletedYears(vehicle.purchasedAt);
  const totalAllBaht = sumMaintenanceBaht(vehicle.maintenanceLogs);
  const totalFilteredBaht = sumMaintenanceBaht(filteredLogs);
  const filterActive = listFilter.trim().length > 0;
  const filteredSubset =
    filterActive && filteredLogs.length !== vehicle.maintenanceLogs.length;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => navigate("/vehicles")}
            className="mb-2 text-sm text-slate-400 hover:text-white"
          >
            ← ยานพาหนะ
          </button>
          <h1 className="text-2xl font-bold text-white">ประวัติการบำรุงรักษา</h1>
          <p className="mt-1 text-lg text-teal-300">{vehicle.licensePlate}</p>
          <p className="mt-0.5 text-slate-400">
            {label}
            {vehicle.assetCode && <span className="text-slate-500"> · ครุภัณฑ์ {vehicle.assetCode}</span>}
            {vehicle.vehicleStatus && (
              <span className="text-slate-500"> · สถานะ {vehicle.vehicleStatus.name}</span>
            )}
            {vehicle.vehicleType && <span className="text-slate-500"> · {vehicle.vehicleType.name}</span>}
            {vehicle.workCategoryGroup && (
              <span className="text-slate-500"> · กลุ่มงาน {vehicle.workCategoryGroup.name}</span>
            )}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {vehicle.purchasedAt ? (
              <>
                วันจัดซื้อ {formatVehiclePurchaseDateTh(vehicle.purchasedAt)}
                {vehicleAgeYears != null ? (
                  <span className="text-slate-400"> · อายุ {vehicleAgeYears} ปี</span>
                ) : null}
              </>
            ) : (
              <span className="text-slate-600">ยังไม่ระบุวันจัดซื้อ — ตั้งได้ที่แก้ไขยานพาหนะ</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTypeModalOpen(true)}
            className="rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            จัดการประเภทรถ
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/25 hover:bg-teal-500"
          >
            บันทึกการบำรุงรักษา
          </button>
        </div>
      </div>

      <PageFilterPrintBar
        value={listFilter}
        onChange={setListFilter}
        printTitle={`ประวัติบำรุงรักษา — ${vehicle.licensePlate}`}
        placeholder="กรองวันที่ / รายละเอียด / ค่าใช้จ่าย…"
      />

      <VehicleTypeMasterModal open={typeModalOpen} onClose={() => setTypeModalOpen(false)} onChanged={() => void load()} />

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="บันทึกการบำรุงรักษา">
        <form onSubmit={submitAdd}>
          <ModalFormBody>
            <label className="block">
              <span className="text-xs text-slate-400">วันที่</span>
              <input
                type="date"
                required
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">รายละเอียดงาน</span>
              <textarea
                required
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={formDetail}
                onChange={(e) => setFormDetail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">ค่าใช้จ่าย (บาท)</span>
              <input
                type="number"
                required
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={formCost}
                onChange={(e) => setFormCost(e.target.value)}
              />
            </label>
          </ModalFormBody>
          <ModalFormActions>
            <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white">
              บันทึก
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
              onClick={() => setAddOpen(false)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <Modal open={!!editLog} onClose={() => setEditLog(null)} title="แก้ไขรายการบำรุงรักษา">
        <form onSubmit={submitEdit}>
          <ModalFormBody>
            <label className="block">
              <span className="text-xs text-slate-400">วันที่</span>
              <input
                type="date"
                required
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">รายละเอียดงาน</span>
              <textarea
                required
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={formDetail}
                onChange={(e) => setFormDetail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">ค่าใช้จ่าย (บาท)</span>
              <input
                type="number"
                required
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                value={formCost}
                onChange={(e) => setFormCost(e.target.value)}
              />
            </label>
          </ModalFormBody>
          <ModalFormActions>
            <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white">
              บันทึก
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
              onClick={() => setEditLog(null)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      {vehicle.maintenanceLogs.length > 0 ? (
        <div className="mt-6 flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-4">
          <p className="text-sm text-slate-300">
            <span className="text-slate-400">รวมค่าใช้จ่ายทั้งหมด</span>{" "}
            <span className="text-lg font-semibold tabular-nums text-teal-300">{formatMaintenanceBaht(totalAllBaht)}</span>{" "}
            <span className="text-slate-500">บาท</span>
            <span className="text-slate-500"> ({vehicle.maintenanceLogs.length} รายการ)</span>
          </p>
          {filteredSubset ? (
            <p className="text-sm text-slate-400">
              ตามการกรอง ({filteredLogs.length} รายการ):{" "}
              <span className="font-semibold tabular-nums text-slate-200">{formatMaintenanceBaht(totalFilteredBaht)}</span> บาท
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={`overflow-x-auto rounded-2xl border border-slate-800 ${vehicle.maintenanceLogs.length > 0 ? "mt-4" : "mt-8"}`}
      >
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
            <tr>
              <th className="p-3">วันที่</th>
              <th className="p-3">รายละเอียด</th>
              <th className="p-3 text-right">ค่าใช้จ่าย</th>
              <th className="p-3 w-40 text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            {vehicle.maintenanceLogs.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-500">
                  ยังไม่มีประวัติ — กด &quot;บันทึกการบำรุงรักษา&quot;
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-500">
                  ไม่มีรายการที่ตรงกับการกรอง
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className="border-b border-slate-800/80">
                  <td className="whitespace-nowrap p-3 text-slate-300">
                    {new Date(log.date).toLocaleDateString("th-TH", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="p-3 text-slate-200">{log.detail}</td>
                  <td className="p-3 text-right tabular-nums text-teal-300">{log.cost}</td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      className="mr-2 text-xs text-teal-400 hover:underline"
                      onClick={() => startEdit(log)}
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      className="text-xs text-rose-400 hover:underline"
                      onClick={() => void removeLog(log)}
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {vehicle.maintenanceLogs.length > 0 && filteredLogs.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-slate-700 bg-slate-900/90 font-medium">
                <td className="p-3 text-slate-400" colSpan={2}>
                  รวม{filteredSubset ? " (รายการที่แสดง)" : ""}
                </td>
                <td className="p-3 text-right tabular-nums text-teal-300">{formatMaintenanceBaht(totalFilteredBaht)}</td>
                <td className="p-3" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

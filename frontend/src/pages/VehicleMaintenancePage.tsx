import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody } from "../components/Modal";
import { VehicleTypeMasterModal } from "../components/VehicleTypeMasterModal";
import type { MaintenanceLog, VehicleDetail } from "../types";
import { vehicleDisplayLabel } from "../types";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { formatVehiclePurchaseDateTh, vehicleAgeCompletedYears } from "../lib/vehicleAge";
import { toolbarLinkBtnClass, toolbarMasterBtnClass, toolbarMasterGroupClass, toolbarPrimaryBtnClass } from "../lib/uiTokens";

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
    return <p className="text-slate-700">ไม่พบรถ</p>;
  }

  if (err && !vehicle) {
    return (
      <div>
        <p className="text-rose-600">{err}</p>
        <Link to="/vehicles" className="mt-4 inline-block text-[#5b61ff] hover:underline">
          ← กลับรายการยานพาหนะ
        </Link>
      </div>
    );
  }

  if (!vehicle) {
    return <p className="text-slate-700">กำลังโหลด…</p>;
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
      <PageHeaderBar
        title="ประวัติการบำรุงรักษา"
        subtitle={
          <>
            <p className="text-base font-bold text-[#4d47b6]">{vehicle.licensePlate}</p>
            <p className="mt-0.5 text-sm text-slate-700">
              {label}
              {vehicle.assetCode && <span> · ครุภัณฑ์ {vehicle.assetCode}</span>}
              {vehicle.vehicleStatus && <span> · สถานะ {vehicle.vehicleStatus.name}</span>}
              {vehicle.vehicleType && <span> · {vehicle.vehicleType.name}</span>}
              {vehicle.workCategoryGroup && <span> · กลุ่มงาน {vehicle.workCategoryGroup.name}</span>}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {vehicle.purchasedAt ? (
                <>
                  วันจัดซื้อ {formatVehiclePurchaseDateTh(vehicle.purchasedAt)}
                  {vehicleAgeYears != null ? <span> · อายุ {vehicleAgeYears} ปี</span> : null}
                </>
              ) : (
                "ยังไม่ระบุวันจัดซื้อ"
              )}
            </p>
          </>
        }
        masters={
          <div className={toolbarMasterGroupClass}>
            <button type="button" onClick={() => setTypeModalOpen(true)} className={toolbarMasterBtnClass}>
              ประเภทรถ
            </button>
          </div>
        }
        extras={
          <button type="button" onClick={() => navigate("/vehicles")} className={toolbarLinkBtnClass}>
            ← ยานพาหนะ
          </button>
        }
        primary={
          <button type="button" onClick={openAdd} className={toolbarPrimaryBtnClass}>
            บันทึกบำรุงรักษา
          </button>
        }
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: `ประวัติบำรุงรักษา — ${vehicle.licensePlate}`,
          placeholder: "กรองวันที่ / รายละเอียด / ค่าใช้จ่าย…",
        }}
      />

      <VehicleTypeMasterModal open={typeModalOpen} onClose={() => setTypeModalOpen(false)} onChanged={() => void load()} />

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="บันทึกการบำรุงรักษา">
        <form onSubmit={submitAdd}>
          <ModalFormBody>
            <label className="block">
              <span className="text-xs text-slate-600">วันที่</span>
              <input
                type="date"
                required
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">รายละเอียดงาน</span>
              <textarea
                required
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={formDetail}
                onChange={(e) => setFormDetail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">ค่าใช้จ่าย (บาท)</span>
              <input
                type="number"
                required
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={formCost}
                onChange={(e) => setFormCost(e.target.value)}
              />
            </label>
          </ModalFormBody>
          <ModalFormActions>
            <button type="submit" className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-4 py-2">
              บันทึก
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
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
              <span className="text-xs text-slate-600">วันที่</span>
              <input
                type="date"
                required
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">รายละเอียดงาน</span>
              <textarea
                required
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={formDetail}
                onChange={(e) => setFormDetail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">ค่าใช้จ่าย (บาท)</span>
              <input
                type="number"
                required
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={formCost}
                onChange={(e) => setFormCost(e.target.value)}
              />
            </label>
          </ModalFormBody>
          <ModalFormActions>
            <button type="submit" className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] px-4 py-2">
              บันทึก
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
              onClick={() => setEditLog(null)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      {vehicle.maintenanceLogs.length > 0 ? (
        <div className="mt-6 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/85 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-4">
          <p className="text-sm text-slate-700">
            <span className="text-slate-700">รวมค่าใช้จ่ายทั้งหมด</span>{" "}
            <span className="text-lg font-semibold tabular-nums text-[#4d47b6]">{formatMaintenanceBaht(totalAllBaht)}</span>{" "}
            <span className="text-slate-700">บาท</span>
            <span className="text-slate-700"> ({vehicle.maintenanceLogs.length} รายการ)</span>
          </p>
          {filteredSubset ? (
            <p className="text-sm text-slate-600">
              ตามการกรอง ({filteredLogs.length} รายการ):{" "}
              <span className="font-semibold tabular-nums text-slate-800">{formatMaintenanceBaht(totalFilteredBaht)}</span> บาท
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={`overflow-x-auto rounded-2xl border border-slate-200 ${vehicle.maintenanceLogs.length > 0 ? "mt-4" : "mt-8"}`}
      >
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-white/90 text-slate-600">
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
                <td colSpan={4} className="p-8 text-center text-slate-600">
                  ยังไม่มีประวัติ — กด &quot;บันทึกการบำรุงรักษา&quot;
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-600">
                  ไม่มีรายการที่ตรงกับการกรอง
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className="border-b border-slate-200">
                  <td className="whitespace-nowrap p-3 text-slate-700">
                    {new Date(log.date).toLocaleDateString("th-TH", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="p-3 text-slate-800">{log.detail}</td>
                  <td className="p-3 text-right tabular-nums text-[#4d47b6]">{log.cost}</td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      className="mr-2 text-xs text-[#5b61ff] hover:underline"
                      onClick={() => startEdit(log)}
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      className="text-xs text-rose-600 hover:underline"
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
              <tr className="border-t-2 border-slate-200 bg-white/90/90 font-medium">
                <td className="p-3 text-slate-700" colSpan={2}>
                  รวม{filteredSubset ? " (รายการที่แสดง)" : ""}
                </td>
                <td className="p-3 text-right tabular-nums text-[#4d47b6]">{formatMaintenanceBaht(totalFilteredBaht)}</td>
                <td className="p-3" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

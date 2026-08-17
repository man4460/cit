/** ตัวเลือกโหลดข้อมูล — silent ไม่แสดงสถานะโหลดทั้งหน้า (ใช้หลังบันทึก/ลบ) */
export type LoadOptions = { silent?: boolean };

export function setLoadBusy(setLoading: (v: boolean) => void, opts?: LoadOptions, busy = true) {
  if (!opts?.silent) setLoading(busy);
}

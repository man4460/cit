import { BOT_PER_DIEM_JRAS, BOT_PER_DIEM_OTHER, BOT_SPECIAL_ALLOWANCE_PER_DAY } from "../lib/botAllowancePrint";
import { OTHER_MISSION_COMP_RATES, POLICE_COMP_NOTES, POLICE_DEST_GROUPS } from "../lib/policeCompensationRates";
import { Modal, ModalFormBody, ModalFormSection } from "./Modal";

/** ค่ายานพาหนะไป-กลับ จนท.ธปท. ต่อคน (ข้อ 5.2) */
const BOT_VEHICLE_TRAVEL_PER_PERSON = 400;

/** โน้ตสำคัญ — อัตราเบี้ยเลี้ยง ธปท. และค่าตอบแทน จนท.ตร. (ใช้ทั้งหน้ารายการภารกิจและหน้าแก้ไขภารกิจ) */
export function MissionRateNotesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="โน้ตสำคัญ — อัตราเบี้ยเลี้ยง / ค่าตอบแทน" size="wide">
      <ModalFormBody>
        <ModalFormSection title="อัตราเบี้ยเลี้ยง พนักงาน ธปท. (ต่อคน/วัน)">
          <div className="overflow-x-auto rounded-xl border border-[#e8e6fc]">
            <table className="min-w-[30rem] w-full border-collapse text-left text-[11px] sm:text-xs">
              <thead>
                <tr className="bg-[#eef2ff] text-[#1e1b4b]">
                  <th className="border-b border-[#d8d9ff] px-2 py-2 font-bold">รายการ</th>
                  <th className="border-b border-[#d8d9ff] px-2 py-2 text-center font-bold">อัตรา</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["ชั้น 4 ลงมา (รวม 4(ควบ) / จรส.) และชั้น 5", `${BOT_PER_DIEM_JRAS.toLocaleString("th-TH")} บาท/คน/วัน`],
                  ["ชั้น 5(ควบ) และชั้น 6 ขึ้นไป", `${BOT_PER_DIEM_OTHER.toLocaleString("th-TH")} บาท/คน/วัน`],
                  ["เบี้ยพิเศษสำหรับภารกิจขนส่ง (ข้อ 8.1)", `${BOT_SPECIAL_ALLOWANCE_PER_DAY.toLocaleString("th-TH")} บาท/คน/วัน`],
                  ["ค่ายานพาหนะไป-กลับ (ข้อ 5.2)", `${BOT_VEHICLE_TRAVEL_PER_PERSON.toLocaleString("th-TH")} บาท/คน`],
                ].map(([label, rate]) => (
                  <tr key={label} className="border-b border-[#ecebff] last:border-0">
                    <td className="px-2 py-2 font-semibold text-[#1e1b4b]">{label}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{rate}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} className="px-2 py-2 leading-relaxed text-slate-600">
                    หมายเหตุ: ถ้าเมนูบุคลากรกำหนดอัตราเบี้ยเลี้ยงรายคนไว้ ระบบใช้อัตรานั้นก่อนระดับชั้น
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </ModalFormSection>
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
  );
}

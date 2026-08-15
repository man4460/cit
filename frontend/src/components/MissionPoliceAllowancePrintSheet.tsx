import {
  buildPolicePrintGroups,
  formatBahtPlain,
  formatThaiMissionDateRange,
  policeGroupColor,
  sumPolicePrintAmount,
  type MissionPoliceStationRow,
  type PoliceAllowancePerson,
} from "../lib/policeAllowancePrint";

type Props = {
  title: string | null | undefined;
  code: string | null | undefined;
  plannedStart: string | null | undefined;
  plannedEnd: string | null | undefined;
  routeLabel: string | null | undefined;
  personnel: PoliceAllowancePerson[];
  policeStations?: MissionPoliceStationRow[];
};

/**
 * แบบฟอร์มค่าตอบแทนบุคคลภายนอก (ตำรวจ/สถานี) — แสดงเฉพาะตอนพิมพ์ (A4 แนวตั้ง)
 */
export function MissionPoliceAllowancePrintSheet({
  plannedStart,
  plannedEnd,
  routeLabel,
  personnel,
  policeStations = [],
}: Props) {
  const groups = buildPolicePrintGroups(personnel, policeStations);
  const grandTotal = sumPolicePrintAmount(groups);
  const dateLine = formatThaiMissionDateRange(plannedStart, plannedEnd);
  const orgLine = routeLabel?.trim() || "สพจ. - ศสร. - ศหญ.";

  return (
    <div className="police-allowance-print-root" aria-hidden>
      <div className="police-allowance-print">
        <header className="police-allowance-print__header">
          <h1>รายงานสรุปรายชื่อตำรวจผู้ปฏิบัติภารกิจ</h1>
          <p className="police-allowance-print__org">{orgLine}</p>
          <p className="police-allowance-print__date">{dateLine}</p>
        </header>

        {groups.length === 0 ? (
          <p className="police-allowance-print__empty">ไม่มีรายชื่อบุคคลภายนอกในภารกิจนี้</p>
        ) : (
          groups.map((g, gi) => (
            <table key={g.key} className="police-allowance-print__table">
              <colgroup>
                <col className="col-no" />
                <col className="col-rank" />
                <col className="col-first" />
                <col className="col-last" />
                <col className="col-id" />
                <col className="col-money" />
                <col className="col-aff" />
              </colgroup>
              <thead>
                <tr>
                  <th colSpan={7} className="group-title" style={{ background: policeGroupColor(gi) }}>
                    {g.title}
                  </th>
                </tr>
                <tr>
                  <th className="col-no">ลำดับ</th>
                  <th className="col-rank">ยศ</th>
                  <th className="col-first">ชื่อ</th>
                  <th className="col-last">สกุล</th>
                  <th className="col-id">บัตรประชาชน / Vendor</th>
                  <th className="col-money">จำนวนเงิน</th>
                  <th className="col-aff">สังกัด</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r, i) => (
                  <tr key={r.key} className={r.isEntity ? "is-entity" : undefined}>
                    <td className="col-no">{i + 1}</td>
                    <td className="col-rank">{r.rank}</td>
                    <td className="col-first">{r.firstName}</td>
                    <td className="col-last">{r.lastName}</td>
                    <td className="col-id">{r.idDisplay}</td>
                    <td className="col-money num">{formatBahtPlain(r.amount)}</td>
                    <td className="col-aff">{r.affiliation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))
        )}

        {groups.length > 0 ? (
          <p className="police-allowance-print__total">
            รวมเงินทั้งหมด{" "}
            <span className="total-box">{formatBahtPlain(grandTotal)}</span>
          </p>
        ) : null}

        <div className="police-allowance-print__sign">
          <p>ลงชื่อ .....................................................</p>
          <p>(นายนรศิ พุกกะมาน)</p>
          <p>ผู้อำนวยการ ฝ่ายรักษาความปลอดภัย</p>
          <p>ผู้รับรองรายชื่อการปฏิบัติภารกิจ</p>
        </div>
      </div>
    </div>
  );
}

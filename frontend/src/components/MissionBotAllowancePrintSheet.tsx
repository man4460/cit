import {
  BOT_SPECIAL_ALLOWANCE_PER_DAY,
  botPerDiemDailyRate,
  filterBotAllowancePersonnel,
  formatBahtPlain,
  formatThaiMissionDateRange,
  missionInclusiveDays,
  type BotAllowancePerson,
} from "../lib/botAllowancePrint";

type Props = {
  title: string | null | undefined;
  code: string | null | undefined;
  plannedStart: string | null | undefined;
  plannedEnd: string | null | undefined;
  routeLabel: string | null | undefined;
  personnel: BotAllowancePerson[];
};

/**
 * แบบฟอร์มรายการเบิกเบี้ยพิเศษฯ ธปท. — แสดงเฉพาะตอนพิมพ์ (A4 แนวนอน)
 * รายชื่อ: ไม่รวมตำรวจ และไม่รวมคนขับ
 */
export function MissionBotAllowancePrintSheet({
  title,
  code,
  plannedStart,
  plannedEnd,
  routeLabel,
  personnel,
}: Props) {
  const rows = filterBotAllowancePersonnel(personnel);
  const days = missionInclusiveDays(plannedStart, plannedEnd);
  const specialPerPerson = BOT_SPECIAL_ALLOWANCE_PER_DAY * days;
  const dateLine = formatThaiMissionDateRange(plannedStart, plannedEnd);
  const orgLine = routeLabel?.trim() || "สพจ. - ศสร. - ศหญ.";

  const lineAmounts = rows.map((p) => {
    const stored = Number(p.perDiemRate);
    const perDiemDay =
      Number.isFinite(stored) && stored > 0 ? stored : botPerDiemDailyRate(p.gradeLevel);
    const perDiem = perDiemDay > 0 ? perDiemDay * days : 0;
    const travelRaw = Number(p.vehicleTravelAllowance);
    const travel = Number.isFinite(travelRaw) && travelRaw > 0 ? travelRaw : 0;
    const special = specialPerPerson;
    return { special, perDiem, travel, total: special + perDiem + travel };
  });
  const specialTotal = lineAmounts.reduce((s, x) => s + x.special, 0);
  const perDiemTotal = lineAmounts.reduce((s, x) => s + x.perDiem, 0);
  const travelTotal = lineAmounts.reduce((s, x) => s + x.travel, 0);
  const grandTotal = lineAmounts.reduce((s, x) => s + x.total, 0);

  return (
    <div className="bot-allowance-print-root" aria-hidden>
      <div className="bot-allowance-print">
        <header className="bot-allowance-print__header">
          <h1>
            รายการเบิกเบี้ยพิเศษสำหรับภารกิจขนส่งธนบัตร เบี้ยเลี้ยง และเงินช่วยเหลือค่ายานพาหนะ
          </h1>
          <p className="bot-allowance-print__org">{orgLine}</p>
          <p className="bot-allowance-print__date">{dateLine}</p>
          {title?.trim() || code ? (
            <p className="bot-allowance-print__mission">
              {[code, title?.trim()].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </header>

        <table className="bot-allowance-print__table">
          <thead>
            <tr>
              <th className="col-no">ลำดับ</th>
              <th className="col-id">รหัสพนักงาน</th>
              <th className="col-name">ชื่อ-สกุล</th>
              <th className="col-pos">ตำแหน่ง</th>
              <th className="col-level">ชั้น</th>
              <th className="col-money">
                เบี้ยพิเศษฯ
                <br />
                <span className="sub">
                  วันละ {BOT_SPECIAL_ALLOWANCE_PER_DAY.toLocaleString("th-TH")} / วัน
                  {days > 1 ? ` × ${days} วัน` : ""}
                </span>
              </th>
              <th className="col-money">เบี้ยเลี้ยง</th>
              <th className="col-money">
                เงินช่วยเหลือ
                <br />
                ยานพาหนะ ไป-กลับ
              </th>
              <th className="col-money">รวมเงิน</th>
              <th className="col-sign">ลายเซ็นผู้รับเงิน</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="empty">
                  ไม่มีรายชื่อที่เข้าเงื่อนไข (ไม่ใช่ตำรวจ และไม่ใช่คนขับ)
                </td>
              </tr>
            ) : (
              rows.map((p, i) => {
                const name = [p.rank, p.fullName].filter(Boolean).join(" ");
                const amt = lineAmounts[i]!;
                const code = p.employeeCode?.trim() || "—";
                return (
                  <tr key={p.personnelId}>
                    <td className="col-no">{i + 1}</td>
                    <td className="col-id">{code}</td>
                    <td className="col-name">{name}</td>
                    <td className="col-pos">{p.position?.trim() || "—"}</td>
                    <td className="col-level">{p.gradeLevel?.trim() || ""}</td>
                    <td className="col-money num">{formatBahtPlain(amt.special)}</td>
                    <td className="col-money num">{amt.perDiem ? formatBahtPlain(amt.perDiem) : ""}</td>
                    <td className="col-money num">{amt.travel ? formatBahtPlain(amt.travel) : ""}</td>
                    <td className="col-money num">{formatBahtPlain(amt.total)}</td>
                    <td className="col-sign" />
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr>
                <td colSpan={5} className="total-label">
                  รวม
                </td>
                <td className="col-money num">{formatBahtPlain(specialTotal)}</td>
                <td className="col-money num">{perDiemTotal ? formatBahtPlain(perDiemTotal) : ""}</td>
                <td className="col-money num">{travelTotal ? formatBahtPlain(travelTotal) : ""}</td>
                <td className="col-money num">{formatBahtPlain(grandTotal)}</td>
                <td />
              </tr>
            </tfoot>
          ) : null}
        </table>

        <p className="bot-allowance-print__note">
          ใบสำคัญรับเงินนี้จะมีผลสมบูรณ์ก็ต่อเมื่อได้รับการโอนเงินแล้ว
        </p>

        <ol className="bot-allowance-print__rules">
          <li>
            ตามประกาศธนาคารแห่งประเทศไทย ที่ สนจ1. 14/2549 เรื่องอัตราเบี้ยเลี้ยงเดินทางไปปฏิบัติงานนอกที่ตั้งสำนักงาน
            และค่าใช้จ่ายในการเดินทางของพนักงานธนาคารแห่งประเทศไทย
          </li>
          <li>
            ตามหนังสือฝ่ายบริหารทั่วไป ที่ ฝบท. 19/2566 ลงวันที่ 20 เมษายน 2566 เรื่องอัตราเบี้ยเลี้ยงในการเดินทางไปปฏิบัติงาน
            เกี่ยวกับธนบัตรและเหรียญกษาปณ์
          </li>
          <li>
            ตามหนังสือฝ่ายบริหารทั่วไป ที่ ฝบท. 65/2567 ลงวันที่ 22 พฤศจิกายน 2567 เรื่องการปรับปรุงอัตราเบี้ยเลี้ยงในการเดินทาง
            ไปปฏิบัติงานเกี่ยวกับธนบัตรและเหรียญกษาปณ์
          </li>
          <li>
            ตามหนังสือฝ่ายบริหารทั่วไป ที่ ฝบท. 19/2568 ลงวันที่ 28 มีนาคม 2568 เรื่องอัตราเงินช่วยเหลือค่าพาหนะเดินทางไป-กลับ
            ในการปฏิบัติงานเกี่ยวกับธนบัตรและเหรียญกษาปณ์
          </li>
        </ol>

        <div className="bot-allowance-print__sign">
          <p>ลงชื่อ .....................................................</p>
          <p>(นายนรศิ พุกกะมาน)</p>
          <p>ผู้อำนวยการ ฝ่ายรักษาความปลอดภัย</p>
        </div>
      </div>
    </div>
  );
}

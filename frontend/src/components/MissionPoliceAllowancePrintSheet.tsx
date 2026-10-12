import { policeDocTotal, type PoliceAllowanceDoc } from "../lib/allowanceDocs";
import { formatBahtPlain, policeGroupColor } from "../lib/policeAllowancePrint";

/**
 * แบบฟอร์มค่าตอบแทนบุคคลภายนอก (ตำรวจ/สถานี) — แสดงเฉพาะตอนพิมพ์ (A4 แนวตั้ง)
 */
export function MissionPoliceAllowancePrintSheet({ doc }: { doc: PoliceAllowanceDoc }) {
  const groups = doc.groups.filter((g) => g.rows.length > 0);
  const grandTotal = policeDocTotal(doc);

  return (
    <div className="police-allowance-print-root" aria-hidden>
      <div className="police-allowance-print">
        <header className="police-allowance-print__header">
          <h1>{doc.heading}</h1>
          <p className="police-allowance-print__org">{doc.orgLine}</p>
          <p className="police-allowance-print__date">{doc.dateLine}</p>
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
                <col className="col-id" />
                <col className="col-money" />
                <col className="col-aff" />
              </colgroup>
              <thead>
                <tr>
                  <th colSpan={6} className="group-title" style={{ background: policeGroupColor(gi) }}>
                    {g.title}
                  </th>
                </tr>
                <tr>
                  <th className="col-no">ลำดับ</th>
                  <th className="col-rank">ยศ</th>
                  <th className="col-first">ชื่อ-สกุล</th>
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
                    <td className="col-first">{[r.firstName, r.lastName].filter((s) => s.trim()).join(" ")}</td>
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
            รวมเงินทั้งหมด <span className="total-box">{formatBahtPlain(grandTotal)}</span>
          </p>
        ) : null}

        {doc.note?.trim() ? (
          <p className="police-allowance-print__note">
            <b>หมายเหตุ</b> {doc.note.trim()}
          </p>
        ) : null}

        <div className="police-allowance-print__sign">
          <p>ลงชื่อ .....................................................</p>
          {doc.signer.name.trim() ? <p>{doc.signer.name}</p> : null}
          {doc.signer.title.trim() ? <p>{doc.signer.title}</p> : null}
          {doc.signer.note.trim() ? <p>{doc.signer.note}</p> : null}
        </div>
      </div>
    </div>
  );
}

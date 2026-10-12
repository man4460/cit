import { botRowTotal, type BotAllowanceDoc } from "../lib/allowanceDocs";
import { formatBahtPlain } from "../lib/botAllowancePrint";

/**
 * แบบฟอร์มรายการเบิกเบี้ยพิเศษฯ ธปท. — แสดงเฉพาะตอนพิมพ์ (A4 แนวนอน)
 */
export function MissionBotAllowancePrintSheet({ doc }: { doc: BotAllowanceDoc }) {
  const rows = doc.rows;
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + (pick(r) || 0), 0);
  const specialTotal = sum((r) => r.special);
  const perDiemTotal = sum((r) => r.perDiem);
  const travelTotal = sum((r) => r.travel);
  const grandTotal = sum(botRowTotal);
  const rules = doc.rules
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="bot-allowance-print-root" aria-hidden>
      <div className="bot-allowance-print">
        <header className="bot-allowance-print__header">
          <h1>{doc.heading}</h1>
          <p className="bot-allowance-print__org">{doc.orgLine}</p>
          <p className="bot-allowance-print__date">{doc.dateLine}</p>
          {doc.missionLine.trim() ? <p className="bot-allowance-print__mission">{doc.missionLine}</p> : null}
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
                <span className="sub">{doc.specialHeader}</span>
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
                  ไม่มีรายชื่อ
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.key}>
                  <td className="col-no">{i + 1}</td>
                  <td className="col-id">{r.employeeCode || "—"}</td>
                  <td className="col-name">{r.name}</td>
                  <td className="col-pos">{r.position || "—"}</td>
                  <td className="col-level">{r.grade}</td>
                  <td className="col-money num">{formatBahtPlain(r.special)}</td>
                  <td className="col-money num">{r.perDiem ? formatBahtPlain(r.perDiem) : ""}</td>
                  <td className="col-money num">{r.travel ? formatBahtPlain(r.travel) : ""}</td>
                  <td className="col-money num">{formatBahtPlain(botRowTotal(r))}</td>
                  <td className="col-sign" />
                </tr>
              ))
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

        {doc.note.trim() ? <p className="bot-allowance-print__note">{doc.note}</p> : null}

        {rules.length ? (
          <ol className="bot-allowance-print__rules">
            {rules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        ) : null}

        <div className="bot-allowance-print__sign">
          <p>ลงชื่อ .....................................................</p>
          {doc.signer.name.trim() ? <p>{doc.signer.name}</p> : null}
          {doc.signer.title.trim() ? <p>{doc.signer.title}</p> : null}
          {doc.signer.note.trim() ? <p>{doc.signer.note}</p> : null}
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { ReportsSubNav } from "../components/ReportsSubNav";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { listCardAccentClass, listCardClass } from "../lib/uiTokens";
import { REPORT_TYPES } from "./reportsConfig";

export function ReportsHubPage() {
  const [listFilter, setListFilter] = useState("");

  const filteredReports = useMemo(
    () => REPORT_TYPES.filter((r) => rowMatchesFilter(listFilter, [r.label, r.slug])),
    [listFilter],
  );

  return (
    <div className="overview-a4-print">
      <PageHeaderBar
        title="รายงาน"
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "รายงาน",
          placeholder: "กรองชื่อรายงาน…",
        }}
        extras={<ReportsSubNav />}
      />

      {filteredReports.length === 0 ? (
        <div className="mt-5 rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-8 text-center text-sm text-slate-500">
          ไม่มีรายการที่ตรงกับการกรอง
        </div>
      ) : (
        <section className="mt-5">
          <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-[#66638c]">รายงานสรุป</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredReports.map((r, idx) => (
              <li key={r.slug}>
                <Link to={`/reports/${r.slug}`} className={`${listCardClass} pl-2`}>
                  <span className={`absolute inset-y-0 left-0 w-1 ${listCardAccentClass(idx)}`} aria-hidden />
                  <span className="text-sm font-bold text-[#1e1b4b]">{r.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

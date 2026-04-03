import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageFilterPrintBar } from "../components/PageFilterPrintBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { REPORT_TYPES } from "./reportsConfig";

export function ReportsHubPage() {
  const [listFilter, setListFilter] = useState("");
  const filtered = useMemo(
    () => REPORT_TYPES.filter((r) => rowMatchesFilter(listFilter, [r.label, r.slug])),
    [listFilter],
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">รายงาน</h1>
      <p className="mt-1 text-slate-400">เลือกประเภทรายงานด้านล่าง</p>

      <PageFilterPrintBar
        value={listFilter}
        onChange={setListFilter}
        printTitle="รายงาน"
        placeholder="กรองชื่อรายงาน…"
      />

      <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 shadow-lg shadow-black/20 sm:p-6">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.length === 0 ? (
            <li className="col-span-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-8 text-center text-sm text-slate-500">
              ไม่มีรายการที่ตรงกับการกรอง
            </li>
          ) : (
            filtered.map((r) => (
              <li key={r.slug}>
                <Link
                  to={`/reports/${r.slug}`}
                  className="block rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-4 text-sm font-medium text-slate-200 transition hover:border-teal-800/60 hover:bg-slate-900 hover:text-teal-200"
                >
                  {r.label}
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

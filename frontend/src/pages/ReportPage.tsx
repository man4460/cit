import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageFilterPrintBar } from "../components/PageFilterPrintBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { REPORT_TYPES } from "./reportsConfig";

export function ReportPage() {
  const { slug } = useParams();
  const meta = REPORT_TYPES.find((r) => r.slug === slug);
  const title = meta?.label ?? "รายงาน";
  const [listFilter, setListFilter] = useState("");

  const contentVisible = useMemo(
    () => rowMatchesFilter(listFilter, [title, slug ?? ""]),
    [listFilter, title, slug],
  );

  return (
    <div>
      <p className="text-sm text-slate-500">
        <Link to="/reports" className="text-teal-500/90 hover:text-teal-400">
          ← รายงาน
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-white">{title}</h1>

      <PageFilterPrintBar
        value={listFilter}
        onChange={setListFilter}
        printTitle={title}
        placeholder="กรองตามชื่อหรือรหัสรายงาน…"
      />

      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-lg shadow-black/20">
        {contentVisible ? (
          <p className="text-slate-400">หน้านี้พร้อมสำหรับเชื่อมข้อมูลหรือไฟล์รายงานในลำดับถัดไป</p>
        ) : (
          <p className="text-slate-500">ไม่มีเนื้อหาที่ตรงกับการกรองในหน้านี้</p>
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { REPORT_GROUPS, REPORT_TYPES } from "./reportsConfig";

const GROUP_ICON_PATHS: Record<(typeof REPORT_GROUPS)[number]["icon"], string> = {
  calendarWeek: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M7 14h10",
  calendarMonth: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M16 14h0M8 17h2M12 17h2",
  chartBar: "M4 20h16M7 16v-5M12 16V7M17 16v-8",
  chartPie: "M12 3v9h9A9 9 0 1112 3zM15 3.5A9 9 0 0120.5 9H15z",
  trophy: "M8 4h8v5a4 4 0 01-8 0zM8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M8.5 20h7M10 17h4v3h-4z",
  folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z",
};

function Svg({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function ReportsHubPage() {
  const [listFilter, setListFilter] = useState("");

  const filteredReports = useMemo(
    () => REPORT_TYPES.filter((r) => rowMatchesFilter(listFilter, [r.label, r.slug, r.hint, REPORT_GROUPS.find((g) => g.key === r.group)?.label])),
    [listFilter],
  );

  const zones = useMemo(
    () => REPORT_GROUPS.map((g) => ({ ...g, reports: filteredReports.filter((r) => r.group === g.key) })).filter((g) => g.reports.length > 0),
    [filteredReports],
  );

  return (
    <div className="overview-a4-print">
      <PageHeaderBar
        title="รายงาน"
        count={filteredReports.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "รายงาน",
          placeholder: "กรองชื่อรายงาน / กลุ่มรายงาน…",
        }}
      />

      {zones.length === 0 ? (
        <div className="mt-5 rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-8 text-center text-sm text-slate-500">
          ไม่มีรายการที่ตรงกับการกรอง
        </div>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {zones.map((g) => (
            <section
              key={g.key}
              className={`flex flex-col rounded-2xl border bg-gradient-to-br via-white to-white p-4 shadow-sm ${g.tone.wrap} ${
                g.key === "other" ? "md:col-span-2" : ""
              }`}
            >
              <header className="mb-3 flex items-center gap-2.5">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${g.tone.tile}`}>
                  <Svg d={GROUP_ICON_PATHS[g.icon]} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-black text-[#1e1b4b]">{g.label}</h2>
                  <p className="text-[11px] text-slate-500">{g.hint}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black tabular-nums text-slate-600 shadow-sm ring-1 ring-slate-200">
                  {g.reports.length}
                </span>
              </header>
              <ul className="divide-y divide-slate-200/70 overflow-hidden rounded-xl border border-slate-200/70 bg-white/80">
                {g.reports.map((r, i) => (
                  <li key={r.slug}>
                    <Link
                      to={`/reports/${r.slug}`}
                      className={`group flex items-center gap-2.5 px-3 py-2 transition ${g.tone.row}`}
                    >
                      <span className="w-4 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-400">{i + 1}</span>
                      <Svg d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" className={`h-4 w-4 shrink-0 ${g.tone.icon}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-[#1e1b4b] group-hover:underline">{r.label}</span>
                        <span className="block truncate text-[11px] text-slate-500">{r.hint}</span>
                      </span>
                      <span className="shrink-0 text-[11px] font-bold text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600">ดู ›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

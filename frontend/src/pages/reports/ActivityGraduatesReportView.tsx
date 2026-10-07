import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../../api/client";
import { PageFilterPrintBar } from "../../components/PageFilterPrintBar";
import { rowMatchesFilter } from "../../lib/searchNormalize";
import { toolbarLinkBtnClass } from "../../lib/uiTokens";

type ReportActivity = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  location: string | null;
  category: { id: string; name: string } | null;
  participants: {
    id: string;
    personnelId: string | null;
    name: string;
    affiliation: string | null;
    personnel: { id: string; fullName: string; rank: string | null; position: string | null; photoUrl: string | null } | null;
  }[];
};

type Graduate = {
  key: string;
  name: string;
  detail: string;
  external: boolean;
  photoUrl: string | null;
  rounds: { id: string; title: string; date: Date }[];
};

const activityDate = (a: ReportActivity) => new Date(a.endsAt ?? a.startsAt ?? a.createdAt);
const beYear = (d: Date) => d.getFullYear() + 543;
const fmtDate = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

export function ActivityGraduatesReportView({ reportTitle, categoryKeyword }: { reportTitle: string; categoryKeyword: string }) {
  const [activities, setActivities] = useState<ReportActivity[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState("");
  const [year, setYear] = useState<number | "">("");
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    let cancelled = false;
    apiJson<ReportActivity[]>("/api/tasks")
      .then((rows) => !cancelled && setActivities(rows))
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
    return () => {
      cancelled = true;
    };
  }, []);

  const inCategory = useMemo(
    () => (activities ?? []).filter((a) => a.category?.name.includes(categoryKeyword)),
    [activities, categoryKeyword],
  );
  const categoryNames = useMemo(() => [...new Set(inCategory.map((a) => a.category!.name))], [inCategory]);
  const years = useMemo(() => [...new Set(inCategory.map((a) => beYear(activityDate(a))))].sort((a, b) => b - a), [inCategory]);

  const inYear = useMemo(
    () => inCategory.filter((a) => year === "" || beYear(activityDate(a)) === year),
    [inCategory, year],
  );
  const rounds = useMemo(
    () => inYear.filter((a) => activityDate(a) <= now).sort((a, b) => activityDate(b).getTime() - activityDate(a).getTime()),
    [inYear, now],
  );
  const upcoming = useMemo(
    () => inYear.filter((a) => activityDate(a) > now).sort((a, b) => activityDate(a).getTime() - activityDate(b).getTime()),
    [inYear, now],
  );

  const graduates = useMemo(() => {
    const map = new Map<string, Graduate>();
    for (const a of rounds) {
      const date = activityDate(a);
      for (const p of a.participants) {
        const key = p.personnelId ?? `n:${p.name.toLowerCase()}`;
        let g = map.get(key);
        if (!g) {
          g = {
            key,
            name: p.name,
            detail: p.personnelId ? p.personnel?.position || "บุคลากร" : p.affiliation || "บุคคลภายนอก",
            external: !p.personnelId,
            photoUrl: p.personnel?.photoUrl ?? null,
            rounds: [],
          };
          map.set(key, g);
        }
        g.rounds.push({ id: a.id, title: a.title, date });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [rounds]);

  const filtered = useMemo(
    () => graduates.filter((g) => rowMatchesFilter(listFilter, [g.name, g.detail, g.external ? "ภายนอก" : "บุคลากร", ...g.rounds.map((r) => r.title)])),
    [graduates, listFilter],
  );

  const externalCount = graduates.filter((g) => g.external).length;
  const latest = rounds[0] ? activityDate(rounds[0]) : null;
  const printTitle = [reportTitle, year ? `ปี ${year}` : "ทุกปี", listFilter.trim() ? `กรอง: ${listFilter.trim()}` : ""].filter(Boolean).join(" — ");

  return (
    <div className="space-y-4">
      <PageFilterPrintBar
        value={listFilter}
        onChange={setListFilter}
        printTitle={printTitle}
        placeholder="กรองชื่อ / ตำแหน่ง / หน่วยงาน / ชื่อกิจกรรม…"
        trailing={
          <>
            <label className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#dcd8f0] bg-white px-2 shadow-sm">
              <span className="text-[11px] font-bold text-[#4d47b6]">ปี</span>
              <select
                className="cursor-pointer border-0 bg-transparent text-[11px] font-semibold text-[#2e2a58] outline-none sm:text-xs"
                value={year}
                onChange={(e) => setYear(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">ทุกปี</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <Link to="/activities" className={toolbarLinkBtnClass}>
              ไปหน้ากิจกรรม
            </Link>
          </>
        }
      />

      {err ? <p className="text-sm text-rose-600">{err}</p> : null}

      {!activities ? (
        <p className="text-slate-700 print:hidden">กำลังโหลด…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "ผู้ผ่านการฝึก", value: graduates.length, unit: "คน", sub: `บุคลากร ${graduates.length - externalCount} · ภายนอก ${externalCount}`, tone: "from-violet-500 to-purple-400" },
              { label: "รอบการฝึก", value: rounds.length, unit: "ครั้ง", sub: upcoming.length ? `กำหนดการถัดไปอีก ${upcoming.length} ครั้ง (ยังไม่นับ)` : "จัดไปแล้วทั้งหมด", tone: "from-sky-500 to-cyan-400" },
              {
                label: "ผ่านมากกว่า 1 ครั้ง",
                value: graduates.filter((g) => g.rounds.length > 1).length,
                unit: "คน",
                sub: "ฝึกซ้ำ / ทบทวน",
                tone: "from-emerald-500 to-teal-400",
              },
              { label: "ฝึกล่าสุด", value: latest ? fmtDate(latest) : "—", unit: "", sub: rounds[0]?.title ?? "ยังไม่มีข้อมูล", tone: "from-amber-500 to-orange-400" },
            ].map((k) => (
              <div key={k.label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm print:border-gray-400">
                <span className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${k.tone}`} aria-hidden />
                <p className="pl-1.5 text-[11px] font-bold text-slate-500">{k.label}</p>
                <p className="pl-1.5 text-xl font-black tabular-nums text-[#1e1b4b]">
                  {k.value} <span className="text-xs font-bold text-slate-500">{k.unit}</span>
                </p>
                <p className="truncate pl-1.5 text-[11px] text-slate-500">{k.sub}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-500">
            ข้อมูลจากกิจกรรมหมวด{" "}
            {categoryNames.length ? categoryNames.map((n) => `«${n}»`).join(", ") : `ที่ชื่อมีคำว่า «${categoryKeyword}» (ยังไม่พบหมวดนี้ในระบบ)`} ·
            รายชื่อมาจาก «ผู้เข้าร่วมกิจกรรม» · นับเป็นผู้ผ่านเมื่อถึงวันสิ้นสุดกิจกรรมแล้ว (ไม่ระบุวัน ใช้วันที่บันทึก)
          </p>

          {graduates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-10 text-center text-sm text-slate-600">
              ยังไม่มีผู้ผ่านการฝึก — บันทึกกิจกรรมหมวดนี้พร้อมรายชื่อผู้เข้าร่วม
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 px-4 py-8 text-center text-sm text-amber-800">ไม่มีรายการตรงกับการกรอง</div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm print:border-gray-400">
              <table className="w-full min-w-[46rem] border-collapse text-left text-sm print:text-black">
                <thead>
                  <tr className="border-b border-slate-200 bg-gradient-to-r from-violet-50 to-white text-[12px] text-[#2e2a58] print:bg-gray-100">
                    <th className="w-10 px-3 py-2 text-right font-bold">#</th>
                    <th className="px-3 py-2 font-bold">ชื่อ - สกุล</th>
                    <th className="px-3 py-2 font-bold">ตำแหน่ง / หน่วยงาน</th>
                    <th className="px-3 py-2 text-center font-bold">ประเภท</th>
                    <th className="px-3 py-2 text-right font-bold">จำนวนครั้ง</th>
                    <th className="px-3 py-2 font-bold">ผ่านล่าสุด</th>
                    <th className="px-3 py-2 font-bold">กิจกรรมที่เข้าร่วม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((g, i) => {
                    const last = g.rounds.reduce((m, r) => (r.date > m ? r.date : m), g.rounds[0]!.date);
                    return (
                      <tr key={g.key} className="align-top hover:bg-violet-50/40">
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{i + 1}</td>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2">
                            {g.photoUrl ? (
                              <img src={g.photoUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover print:hidden" />
                            ) : (
                              <span
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white print:hidden ${
                                  g.external ? "bg-slate-400" : "bg-gradient-to-br from-violet-500 to-purple-400"
                                }`}
                              >
                                {g.name.replace(/^(นางสาว|นาย|นาง)\s*/, "").charAt(0)}
                              </span>
                            )}
                            <span className="font-semibold text-[#1e1b4b]">{g.name}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{g.detail}</td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                              g.external ? "bg-slate-100 text-slate-600" : "bg-violet-100 text-violet-700"
                            }`}
                          >
                            {g.external ? "ภายนอก" : "บุคลากร"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums text-[#1e1b4b]">{g.rounds.length}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700">{fmtDate(last)}</td>
                        <td className="px-3 py-2 text-[12px] text-slate-600">
                          {g.rounds
                            .slice()
                            .sort((a, b) => b.date.getTime() - a.date.getTime())
                            .map((r) => `${r.title} (${fmtDate(r.date)})`)
                            .join(", ")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {rounds.length ? (
            <section className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/70 via-white to-white p-4 shadow-sm print:break-inside-avoid">
              <h3 className="mb-2 text-sm font-black text-[#1e1b4b]">รอบการฝึก ({rounds.length})</h3>
              <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {rounds.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12.5px]">
                    <span className="whitespace-nowrap font-bold tabular-nums text-sky-700">{fmtDate(activityDate(a))}</span>
                    <span className="min-w-0 flex-1 truncate text-[#1e1b4b]" title={a.title}>
                      {a.title}
                    </span>
                    <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10.5px] font-bold text-violet-700">{a.participants.length} คน</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {upcoming.length ? (
            <section className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/70 via-white to-white p-4 shadow-sm print:hidden">
              <h3 className="mb-2 text-sm font-black text-[#1e1b4b]">
                กำหนดการถัดไป ({upcoming.length}) <span className="text-[11px] font-semibold text-slate-500">— ยังไม่นับเป็นผู้ผ่าน</span>
              </h3>
              <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-xl border border-dashed border-amber-200 bg-white px-3 py-2 text-[12.5px]">
                    <span className="whitespace-nowrap font-bold tabular-nums text-amber-700">{fmtDate(activityDate(a))}</span>
                    <span className="min-w-0 flex-1 truncate text-[#1e1b4b]" title={a.title}>
                      {a.title}
                    </span>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-700">{a.participants.length} คน</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

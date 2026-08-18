import { Modal } from "./Modal";
import { INVESTIGATION_LAW_GROUPS, type InvestigationLawGroup } from "../lib/investigationLaws";

const TONE: Record<
  InvestigationLawGroup["tone"],
  { bar: string; chip: string; border: string; soft: string; no: string }
> = {
  violet: {
    bar: "bg-gradient-to-b from-[#0000BF] to-[#8b5cf6]",
    chip: "bg-[#0000BF]/10 text-[#0000BF]",
    border: "border-violet-200/80",
    soft: "from-violet-50/90 via-white to-fuchsia-50/40",
    no: "bg-[#0000BF] text-white",
  },
  rose: {
    bar: "bg-gradient-to-b from-rose-500 to-pink-400",
    chip: "bg-rose-500/15 text-rose-800",
    border: "border-rose-200/80",
    soft: "from-rose-50/90 via-white to-orange-50/40",
    no: "bg-rose-600 text-white",
  },
  teal: {
    bar: "bg-gradient-to-b from-teal-600 to-cyan-400",
    chip: "bg-teal-500/15 text-teal-800",
    border: "border-teal-200/80",
    soft: "from-teal-50/90 via-white to-cyan-50/40",
    no: "bg-teal-700 text-white",
  },
};

export function InvestigationLawsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="กฎหมายที่รับผิดชอบ" size="wide">
      <p className="text-[13px] leading-relaxed text-slate-600">
        สรุปฐานกฎหมายสำหรับงานสืบสวน ธปท. (ศสป.) จัดหมวดหมู่ตามยุทธศาสตร์
      </p>

      <div className="mt-4 space-y-4">
        {INVESTIGATION_LAW_GROUPS.map((g) => {
          const t = TONE[g.tone];
          return (
            <section
              key={g.id}
              className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 ${t.border} ${t.soft}`}
            >
              <span className={`absolute inset-y-0 left-0 w-1.5 ${t.bar}`} aria-hidden />
              <div className="pl-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${t.chip}`}>
                    กลุ่มที่ {g.groupNo}
                  </span>
                  <h3 className="text-sm font-black text-[#1e1b4b]">กฎหมายสนับสนุน {g.title}</h3>
                </div>
                <p className="mt-1 text-[12px] font-semibold text-slate-700">{g.axis}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-slate-600">
                  <span className="font-bold text-slate-500">เป้าหมายสืบสวน: </span>
                  {g.goal}
                </p>

                <ol className="mt-3 space-y-2.5">
                  {g.laws.map((law) => (
                    <li
                      key={law.no}
                      className="flex gap-2.5 rounded-xl border border-white/80 bg-white/80 px-3 py-2.5 shadow-sm"
                    >
                      <span
                        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${t.no}`}
                      >
                        {law.no}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold leading-snug text-[#1e1b4b]">
                          {law.title}
                          {law.short ? (
                            <span className="ml-1.5 text-[11px] font-semibold text-slate-500">({law.short})</span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">
                          <span className="font-semibold text-slate-500">ใช้สืบสวน: </span>
                          {law.use}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}

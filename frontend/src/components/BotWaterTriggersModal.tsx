import { Modal, ModalFormActions, ModalFormBody } from "./Modal";
import {
  BOT_ACTION_GROUPS,
  BOT_CRITERIA_GROUPS,
  BOT_TRIGGER_DOC,
  BOT_TRIGGER_STATUS,
  type BotTriggerBand,
} from "../lib/botWaterTriggers";

const th = "border-b border-slate-200 px-2.5 py-2 text-left text-[11px] font-bold whitespace-nowrap";
const td = "border-b border-slate-100 px-2.5 py-2 align-top text-[11px] leading-relaxed text-slate-700";

function AreaChips({ areas }: { areas: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {areas.map((a) => (
        <span
          key={a}
          className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-900"
        >
          {a}
        </span>
      ))}
    </div>
  );
}

function BandCells({ bands }: { bands: BotTriggerBand }) {
  return (
    <>
      <td className={`${td} border-l border-emerald-100 bg-emerald-50/40`}>{bands.green}</td>
      <td className={`${td} border-l border-amber-100 bg-amber-50/40`}>{bands.yellow}</td>
      <td className={`${td} border-l border-orange-100 bg-orange-50/40`}>{bands.orange}</td>
      <td className={`${td} border-l border-rose-100 bg-rose-50/40`}>{bands.red}</td>
    </>
  );
}

function StatusHeads() {
  return (
    <>
      {BOT_TRIGGER_STATUS.map((s) => (
        <th key={s.key} className={`${th} min-w-[8.5rem] ${s.head}`}>
          <div>{s.label}</div>
          <div className="mt-0.5 text-[10px] font-semibold opacity-80">
            {s.meaning} · {s.action}
          </div>
        </th>
      ))}
    </>
  );
}

export function BotWaterTriggersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="เกณฑ์ทริกเกอร์ ธปท." size="viewer" overlayZClass="z-[80]">
      <ModalFormBody className="!space-y-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-sm font-bold text-slate-900">{BOT_TRIGGER_DOC.title}</p>
          <p className="mt-0.5 text-[12px] text-sky-800">{BOT_TRIGGER_DOC.dated}</p>
          <p className="mt-1.5 text-[11px] text-slate-600">
            จัดกลุ่มพื้นที่ที่ใช้เกณฑ์หรือ Action ชุดเดียวกันไว้ตารางเดียว · แยกส่วนเกณฑ์ กับ ส่วนมาตรการ
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {BOT_TRIGGER_STATUS.map((s) => (
              <span key={s.key} className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${s.className}`}>
                {s.label} · {s.meaning} · {s.action}
              </span>
            ))}
          </div>
        </div>

        {/* ---------- เกณฑ์ ---------- */}
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-sky-600 px-1.5 text-[11px] font-bold text-white">
              1
            </span>
            เกณฑ์เฝ้าระวัง
          </h2>

          {BOT_CRITERIA_GROUPS.map((g) => (
            <section key={g.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 bg-gradient-to-r from-sky-50 to-slate-50 px-3 py-2.5">
                <div className="min-w-0 space-y-1">
                  <h3 className="text-sm font-black text-slate-900">{g.title}</h3>
                  {g.note ? <p className="text-[11px] text-slate-600">{g.note}</p> : null}
                </div>
                <AreaChips areas={g.areas} />
              </header>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className={`${th} min-w-[14rem] text-slate-700`}>จุดวัด</th>
                      <StatusHeads />
                    </tr>
                  </thead>
                  <tbody>
                    {g.points.map((p) => (
                      <tr key={p.name} className="hover:bg-sky-50/40">
                        <td className={`${td} font-semibold text-slate-900`}>
                          {p.name}
                          {p.unit ? <div className="mt-0.5 text-[10px] font-medium text-slate-500">หน่วย: {p.unit}</div> : null}
                        </td>
                        <BandCells bands={p.bands} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {g.stationsByArea?.length ? (
                <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-2.5">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">สถานีวัดตามพื้นที่</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {g.stationsByArea.map((block) => (
                      <div key={block.area} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                        <div className="mb-1 text-[11px] font-bold text-sky-900">{block.area}</div>
                        <ol className="list-decimal space-y-0.5 pl-4 text-[11px] leading-relaxed text-slate-700">
                          {block.stations.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ))}
        </div>

        {/* ---------- Action ---------- */}
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-800 px-1.5 text-[11px] font-bold text-white">
              2
            </span>
            มาตรการ (Action) ตามระดับสี
          </h2>

          {BOT_ACTION_GROUPS.map((g) => (
            <section key={g.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 bg-gradient-to-r from-slate-100 to-slate-50 px-3 py-2.5">
                <div className="min-w-0 space-y-1">
                  <h3 className="text-sm font-black text-slate-900">{g.title}</h3>
                  {g.note ? <p className="text-[11px] text-slate-600">{g.note}</p> : null}
                </div>
                <AreaChips areas={g.areas} />
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className={`${th} w-20 text-slate-700`}>ระดับ</th>
                      <th className={`${th} text-slate-700`}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BOT_TRIGGER_STATUS.map((s) => (
                      <tr key={s.key}>
                        <td className={`${td}`}>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${s.className}`}>
                            {s.label}
                          </span>
                        </td>
                        <td className={`${td}`}>{g.actions[s.key]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <p className="text-[11px] text-slate-500">
            ศูนย์จัดการธนบัตร 5 แห่ง (ศรย. ศพล. ศอบ. ศนร. ศสร.) ใช้เกณฑ์ % ความจุร่วมกับ สนภ. — ธปท. ยังไม่กำหนดมาตรการเฉพาะในเอกสารฉบับนี้
          </p>
        </div>
      </ModalFormBody>
      <ModalFormActions>
        <button
          type="button"
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
          onClick={onClose}
        >
          ปิด
        </button>
      </ModalFormActions>
    </Modal>
  );
}

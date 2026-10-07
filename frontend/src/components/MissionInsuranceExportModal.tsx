import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiDownload, apiJson } from "../api/client";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "./Modal";

type Preview = {
  code: string | null;
  title: string | null;
  days: number;
  travelLabel: string;
  routeLabel: string;
  purgedCount: number;
  annualCovered: { name: string; company: string | null; policyNumber: string | null; expiry: string | null }[];
  people: { name: string; unit: string; missing: string[]; annualExpired: string | null }[];
};

type Rate = { days: number; rate: number };

type Settings = {
  agencyName: string;
  operatorName: string;
  operatorIdNumber: string;
  taxId: string;
  department: string;
  address: string;
  phone: string;
  note: string;
  insurerName: string;
  insurerContact: string;
  insurerDepartment: string;
  insurerTel: string;
  insurerFax: string;
  insurerEmail: string;
  policyType: string;
  sumInsured: string;
  medicalExpense: string;
  discountLabel: string;
  rates: Rate[];
};

const STORAGE_KEY = "cit.insuranceExport.v1";

const DEFAULTS: Settings = {
  agencyName: "ธนาคารแห่งประเทศไทย",
  operatorName: "",
  operatorIdNumber: "",
  taxId: "0994000162243",
  department: "ฝ่ายรักษาความปลอดภัย ธนาคารแห่งประเทศไทย",
  address: "18 หมู่ 2 ตำบลขุนแก้ว อำเภอนครชัยศรี จังหวัดนครปฐม 73120",
  phone: "02-356-8557, 08-1458-2228 โทรสาร 02-356-8551",
  note: "ส่งกรมธรรม์พร้อมใบแจ้งหนี้ตามที่อยู่ด้านบน และประทับตราวงกลมทุกหน้าในรายชื่อ เพื่อให้ลูกค้าตั้งเบิกได้ โดยจัดส่งกรมธรรม์ถึงลูกค้าภายใน 3 วัน",
  insurerName: "บริษัท วิริยะประกันภัย จำกัด (มหาชน)",
  insurerContact: "คุณบุปผา หมัดเชี่ยว",
  insurerDepartment: "แผนกการตลาดกลุ่มองค์กร ฝ่ายการตลาด Non-Motor ด้านบุคคล",
  insurerTel: "089-163-4427 / 02-129-7488",
  insurerFax: "",
  insurerEmail: "bupham@viriyah.co.th, Direct_corp@viriyah.co.th",
  policyType: "ประกันอุบัติเหตุการเดินทางโดยรถยนต์",
  sumInsured: "2 ล้านบาท",
  medicalExpense: "200,000 บาท",
  discountLabel: "ลด 15%",
  rates: [
    { days: 1, rate: 237 },
    { days: 3, rate: 458 },
    { days: 5, rate: 628 },
  ],
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0000BF] focus:ring-2 focus:ring-[#0000BF]/15";
const labelClass = "text-xs font-medium text-slate-700";

const AGENCY_FIELDS: [keyof Settings, string, boolean?][] = [
  ["agencyName", "หน่วยงาน"],
  ["operatorName", "ผู้ดำเนินการ"],
  ["operatorIdNumber", "เลขบัตรประชาชนผู้ดำเนินการ"],
  ["taxId", "เลขผู้เสียภาษี"],
  ["department", "ส่วนงาน", true],
  ["address", "ที่อยู่", true],
  ["phone", "เบอร์ติดต่อ", true],
  ["note", "หมายเหตุ", true],
];

const INSURER_FIELDS: [keyof Settings, string, boolean?][] = [
  ["insurerName", "บริษัทประกัน", true],
  ["insurerContact", "ผู้ดำเนินการ"],
  ["insurerTel", "โทรศัพท์"],
  ["insurerDepartment", "ฝ่าย / แผนก", true],
  ["insurerFax", "โทรสาร"],
  ["insurerEmail", "E-mail"],
];

const COVERAGE_FIELDS: [keyof Settings, string, boolean?][] = [
  ["policyType", "ประเภทกรมธรรม์", true],
  ["sumInsured", "ทุนประกัน"],
  ["medicalExpense", "ค่ารักษาพยาบาล"],
  ["discountLabel", "หมายเหตุอัตราเบี้ย (เช่น ลด 15%)"],
];

export function MissionInsuranceExportModal({ missionId, onClose }: { missionId: string | null; onClose: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [s, setS] = useState<Settings>(loadSettings);
  const [travel, setTravel] = useState("");
  const [route, setRoute] = useState("");
  const [tax, setTax] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!missionId) return;
    setPreview(null);
    setErr(null);
    setTax("");
    apiJson<Preview>(`/api/missions/${missionId}/insurance-preview`, { skipCache: true })
      .then((p) => {
        setPreview(p);
        setTravel(p.travelLabel);
        setRoute(p.routeLabel);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [missionId]);

  const field = (k: keyof Settings, label: string, wide?: boolean) => (
    <label key={k} className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      <input
        className={inputClass}
        value={String(s[k] ?? "")}
        onChange={(e) => setS((cur) => ({ ...cur, [k]: e.target.value }))}
      />
    </label>
  );

  const tiers = [...s.rates].filter((r) => r.days > 0).sort((a, b) => a.days - b.days);
  const tier = preview ? (tiers.find((t) => t.days >= preview.days) ?? tiers[tiers.length - 1]) : undefined;
  const count = preview?.people.length ?? 0;
  const incomplete = preview?.people.filter((p) => p.missing.length) ?? [];
  const annualExpired = preview?.people.filter((p) => p.annualExpired) ?? [];

  async function download() {
    if (!missionId || !preview) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setBusy(true);
    try {
      await apiDownload(
        `/api/missions/${missionId}/insurance-export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...s, travelLabel: travel, routeLabel: route, tax: tax === "" ? null : Number(tax) }),
        },
        `ประกัน_${preview.code ?? "ภารกิจ"}.xlsx`,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "ส่งออกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={Boolean(missionId)} onClose={onClose} title="ไฟล์แจ้งทำประกัน — ส่งบริษัทประกัน" size="wide" overlayZClass="z-[100]">
      <ModalFormBody>
        {err ? <p className="text-sm text-rose-600">{err}</p> : null}
        {!preview && !err ? <p className="text-sm text-slate-500">กำลังโหลดข้อมูลภารกิจ…</p> : null}
        {preview ? (
          <>
            <ModalFormSection title="ภารกิจ">
              <p className="text-sm font-bold text-[#1e1b4b]">
                {[preview.code, preview.title].filter(Boolean).join(" — ") || "ภารกิจ"}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>วันเดินทาง</span>
                  <input className={inputClass} value={travel} onChange={(e) => setTravel(e.target.value)} />
                </label>
                <label className="block">
                  <span className={labelClass}>เส้นทาง</span>
                  <input className={inputClass} value={route} onChange={(e) => setRoute(e.target.value)} />
                </label>
              </div>
              <div className="flex flex-wrap gap-2 text-[12.5px]">
                <span className="rounded-lg bg-indigo-50 px-2.5 py-1 font-bold text-indigo-800">{preview.days} วัน</span>
                <span className="rounded-lg bg-indigo-50 px-2.5 py-1 font-bold text-indigo-800">{count} คน</span>
                {tier ? (
                  <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800">
                    เบี้ย {tier.rate.toLocaleString("th-TH")} บาท/คน (อัตรา {tier.days} วัน) · รวม{" "}
                    {(tier.rate * count).toLocaleString("th-TH")} บาท
                  </span>
                ) : null}
              </div>
              {incomplete.length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                  <p className="font-bold">ข้อมูลยังไม่ครบ {incomplete.length} คน — ในไฟล์จะเว้นว่างหรือแสดง "ไม่มีข้อมูล"</p>
                  <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-5">
                    {incomplete.map((p) => (
                      <li key={p.name}>
                        {p.name}: ขาด{p.missing.join(", ")}
                      </li>
                    ))}
                  </ul>
                  <Link to="/personnel" className="mt-1 inline-block font-bold text-[#0000BF] hover:underline">
                    ไปเติมข้อมูลที่หน้าบุคลากร ›
                  </Link>
                </div>
              ) : null}
              {preview.annualCovered.length ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[12.5px] text-sky-900">
                  <p className="font-bold">
                    ไม่รวมในไฟล์ {preview.annualCovered.length} คน — มีประกันอุบัติเหตุรายปีครอบคลุมวันเดินทางแล้ว
                  </p>
                  <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-5">
                    {preview.annualCovered.map((p) => (
                      <li key={p.name}>
                        {p.name}
                        <span className="text-sky-700">
                          {[p.company, p.policyNumber ? `กรมธรรม์ ${p.policyNumber}` : null, p.expiry ? `ถึง ${p.expiry}` : "ไม่ระบุวันหมดอายุ"]
                            .filter(Boolean)
                            .map((x) => ` · ${x}`)
                            .join("")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {annualExpired.length ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-900">
                  <p className="font-bold">
                    ประกันรายปีหมดอายุก่อนวันเดินทาง {annualExpired.length} คน — รวมในไฟล์ประกันรายครั้งนี้แล้ว
                  </p>
                  <ul className="mt-1 list-disc pl-5">
                    {annualExpired.map((p) => (
                      <li key={p.name}>
                        {p.name} (หมดอายุ {p.annualExpired})
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {preview.purgedCount ? (
                <p className="text-[12px] text-slate-500">
                  ไม่รวม {preview.purgedCount} คนที่ข้อมูลถูกทำลายตาม PDPA แล้ว
                </p>
              ) : null}
            </ModalFormSection>

            <ModalFormSection title="ความคุ้มครองและอัตราเบี้ย">
              <div className="grid gap-3 sm:grid-cols-2">{COVERAGE_FIELDS.map(([k, l, w]) => field(k, l, w))}</div>
              <div className="space-y-2">
                <p className={labelClass}>อัตราเบี้ยต่อคน (ระบบเลือกขั้นที่ครอบคลุมจำนวนวันเดินทาง)</p>
                {s.rates.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <input
                      type="number"
                      min={1}
                      className={`${inputClass} !mt-0 w-24`}
                      value={r.days}
                      onChange={(e) =>
                        setS((cur) => ({ ...cur, rates: cur.rates.map((x, j) => (j === i ? { ...x, days: Number(e.target.value) } : x)) }))
                      }
                    />
                    <span className="text-slate-600">วัน</span>
                    <input
                      type="number"
                      min={0}
                      className={`${inputClass} !mt-0 w-32`}
                      value={r.rate}
                      onChange={(e) =>
                        setS((cur) => ({ ...cur, rates: cur.rates.map((x, j) => (j === i ? { ...x, rate: Number(e.target.value) } : x)) }))
                      }
                    />
                    <span className="text-slate-600">บาท</span>
                    <button
                      type="button"
                      onClick={() => setS((cur) => ({ ...cur, rates: cur.rates.filter((_, j) => j !== i) }))}
                      className="text-[12px] font-bold text-rose-600 hover:underline"
                    >
                      ลบ
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setS((cur) => ({ ...cur, rates: [...cur.rates, { days: 7, rate: 0 }] }))}
                  className="rounded-lg border border-dashed border-indigo-300 px-3 py-1.5 text-[12.5px] font-bold text-indigo-700 hover:bg-indigo-50"
                >
                  + เพิ่มขั้นอัตรา
                </button>
                <label className="block max-w-xs">
                  <span className={labelClass}>ภาษี / อากร (บาท) — เว้นว่างได้</span>
                  <input type="number" min={0} className={inputClass} value={tax} onChange={(e) => setTax(e.target.value)} />
                </label>
              </div>
            </ModalFormSection>

            <ModalFormSection title="ผู้ขอเอาประกันภัย">
              <div className="grid gap-3 sm:grid-cols-2">{AGENCY_FIELDS.map(([k, l, w]) => field(k, l, w))}</div>
            </ModalFormSection>

            <ModalFormSection title="บริษัทประกันภัย">
              <div className="grid gap-3 sm:grid-cols-2">{INSURER_FIELDS.map(([k, l, w]) => field(k, l, w))}</div>
            </ModalFormSection>
          </>
        ) : null}
      </ModalFormBody>
      <ModalFormActions>
        <button
          type="button"
          disabled={!preview || !count || busy}
          onClick={() => void download()}
          className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-5 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 disabled:opacity-50"
        >
          {busy ? "กำลังสร้างไฟล์…" : "ดาวน์โหลดไฟล์ Excel"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm("คืนค่าข้อมูลหน่วยงาน/บริษัทประกันเป็นค่าเริ่มต้น?")) setS(DEFAULTS);
          }}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
        >
          คืนค่าเริ่มต้น
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700">
          ปิด
        </button>
        <p className="w-full text-[11.5px] text-slate-500">ข้อมูลหน่วยงานและบริษัทประกันจะถูกจำไว้ในเครื่องนี้ ครั้งหน้าไม่ต้องกรอกใหม่</p>
      </ModalFormActions>
    </Modal>
  );
}

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { brandCtaButtonClass, mediaUrl } from "../lib/uiTokens";
import { prepareImageFileForUpload } from "../lib/prepareImageFileForUpload";
import { PDPA_CONSENT_CHECKBOX, PDPA_CONSENT_SECTIONS, PDPA_CONSENT_TITLE } from "../lib/pdpa";

type Mode = "edit" | "new";
type Step = "loading" | "invalid" | "gate" | "form" | "done";
type Ben = { fullName: string; relationship: string; phone: string; idNumber: string };
type Form = {
  fullName: string;
  idNumber: string;
  employeeCode: string;
  rank: string;
  position: string;
  phone: string;
  bloodType: string;
  birthDate: string;
  personnelCategoryId: string;
  insuranceCompany: string;
  insurancePolicyNumber: string;
  insuranceExpiry: string;
  insuranceNotes: string;
  beneficiaries: Ben[];
};
type Option = { id: string; name: string };

const EMPTY: Form = {
  fullName: "",
  idNumber: "",
  employeeCode: "",
  rank: "",
  position: "",
  phone: "",
  bloodType: "",
  birthDate: "",
  personnelCategoryId: "",
  insuranceCompany: "",
  insurancePolicyNumber: "",
  insuranceExpiry: "",
  insuranceNotes: "",
  beneficiaries: [],
};

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none focus:border-[#0000BF] focus:ring-2 focus:ring-[#0000BF]/20";
const labelClass = "text-xs font-semibold text-slate-600";
const photoBtnClass =
  "flex cursor-pointer items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-[13px] font-bold text-[#0000BF] shadow-sm hover:bg-indigo-50 active:scale-[0.98]";

function GalleryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="9" cy="10" r="1.8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 16-5-5-8 9" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1.3-2h6l1.3 2h1.2A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5z"
      />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  );
}

function formatThaiId(d: string) {
  const parts = [d.slice(0, 1), d.slice(1, 5), d.slice(5, 10), d.slice(10, 12), d.slice(12, 13)];
  return parts.filter(Boolean).join("-");
}

function isValidThaiId(d: string) {
  if (!/^\d{13}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

function apiUrl(path: string) {
  const base = import.meta.env.VITE_API_URL ?? "";
  return `${base}${path}`.replace(/([^:]\/)\/+/g, "$1");
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { ...init, headers: { Accept: "application/json", ...(init?.headers ?? {}) } });
  } catch {
    throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่");
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? `ไม่สำเร็จ (${res.status})`);
  return data as T;
}

/** หน้ากรอกข้อมูลตนเองของบุคลากร — แยกจากระบบหลัก ไม่มีเมนูหรือลิงก์ไปหน้าอื่น */
export function PersonnelSelfPage() {
  const { token = "" } = useParams();
  const [mode, setMode] = useState<Mode>("new");
  const [step, setStep] = useState<Step>("loading");
  const [err, setErr] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [idInput, setIdInput] = useState("");
  const [maskedId, setMaskedId] = useState("");
  const [f, setF] = useState<Form>(EMPTY);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState<Option[]>([]);
  const [bloodTypes, setBloodTypes] = useState<string[]>([]);

  useEffect(() => {
    call<{ mode: Mode; categories: Option[]; bloodTypes: string[] }>(`/api/personnel-self/${encodeURIComponent(token)}`)
      .then((r) => {
        setMode(r.mode);
        setCategories(r.categories ?? []);
        setBloodTypes(r.bloodTypes ?? []);
        setStep("gate");
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : "ลิงก์ไม่ถูกต้อง");
        setStep("invalid");
      });
  }, [token]);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function onPhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPhoto(await prepareImageFileForUpload(file));
    } catch {
      setPhoto(file);
    }
  }

  const set = (k: Exclude<keyof Form, "beneficiaries">) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!consent) return setErr("กรุณายอมรับการเก็บและใช้ข้อมูลส่วนบุคคล (PDPA) ก่อน");
    if (!isValidThaiId(idInput)) return setErr("เลขบัตรประชาชนไม่ถูกต้อง — ตรวจสอบให้ครบ 13 หลัก");
    setBusy(true);
    try {
      const d = await call<{
        exists: boolean;
        fullName: string;
        idNumber: string;
        employeeCode: string | null;
        rank: string | null;
        position: string | null;
        phone: string | null;
        bloodType: string | null;
        birthDate: string | null;
        personnelCategoryId: string | null;
        photoUrl: string | null;
        insuranceCompany: string | null;
        insurancePolicyNumber: string | null;
        insuranceExpiry: string | null;
        insuranceNotes: string | null;
        beneficiaries: { fullName: string; relationship: string | null; phone: string | null; idNumber: string | null }[];
      }>(`/api/personnel-self/${encodeURIComponent(token)}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idNumber: idInput, pdpaConsent: true }),
      });
      setMaskedId(d.idNumber);
      setMode(d.exists ? "edit" : "new");
      if (!d.exists) {
        setF(EMPTY);
        setPhotoPreview(null);
        setStep("form");
        return;
      }
      setF({
        fullName: d.fullName,
        idNumber: "",
        employeeCode: d.employeeCode ?? "",
        rank: d.rank ?? "",
        position: d.position ?? "",
        phone: d.phone ?? "",
        bloodType: d.bloodType ?? "",
        birthDate: d.birthDate ? d.birthDate.slice(0, 10) : "",
        personnelCategoryId: d.personnelCategoryId ?? "",
        insuranceCompany: d.insuranceCompany ?? "",
        insurancePolicyNumber: d.insurancePolicyNumber ?? "",
        insuranceExpiry: d.insuranceExpiry ? d.insuranceExpiry.slice(0, 10) : "",
        insuranceNotes: d.insuranceNotes ?? "",
        beneficiaries: d.beneficiaries.map((b) => ({
          fullName: b.fullName,
          relationship: b.relationship ?? "",
          phone: b.phone ?? "",
          idNumber: b.idNumber ?? "",
        })),
      });
      setPhotoPreview(mediaUrl(d.photoUrl));
      setStep("form");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ยืนยันตัวตนไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(f)) if (k !== "beneficiaries" && k !== "idNumber") fd.append(k, String(v));
      fd.append("idNumber", idInput);
      fd.append("beneficiaries", JSON.stringify(f.beneficiaries.filter((b) => b.fullName.trim())));
      fd.append("pdpaConsent", consent ? "true" : "false");
      if (photo) fd.append("photo", photo);
      await call(`/api/personnel-self/${encodeURIComponent(token)}`, { method: "POST", body: fd });
      setStep("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const setBen = (i: number, k: keyof Ben, v: string) =>
    setF((cur) => ({ ...cur, beneficiaries: cur.beneficiaries.map((b, j) => (j === i ? { ...b, [k]: v } : b)) }));

  return (
    <div
      className="app-shell flex min-h-[100dvh] flex-col items-center px-3 py-6"
      style={{ paddingTop: "max(1.5rem, env(safe-area-inset-top, 0px))", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="app-card-surface w-full max-w-2xl rounded-3xl border border-white/80 p-5 sm:p-7">
        <div className="flex justify-center">
          <img src="/logo-login.png" alt="ALL FOR ONE" draggable={false} className="h-auto w-full max-w-[12rem] object-contain" />
        </div>
        <h1 className="mt-3 text-center text-lg font-black text-[#1e1b3a]">
          {step !== "form" && step !== "done"
            ? "ข้อมูลบุคลากร"
            : mode === "edit"
              ? "ตรวจสอบและแก้ไขข้อมูลของท่าน"
              : "ลงทะเบียนข้อมูลบุคลากรใหม่"}
        </h1>
        <p className="text-center text-[12px] text-slate-500">ภารกิจขนส่งธนบัตร</p>

        {err && step !== "invalid" ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>
        ) : null}

        {step === "loading" ? <p className="mt-8 text-center text-sm text-slate-500">กำลังตรวจสอบลิงก์…</p> : null}

        {step === "invalid" ? (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-center text-sm font-semibold text-amber-800">{err}</p>
        ) : null}

        {step === "gate" ? (
          <form onSubmit={verify} className="mt-5 space-y-3">
            <div className="max-h-[40vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-[13px] leading-relaxed text-slate-700">
              <p className="mb-2 font-black text-[#1e1b4b]">{PDPA_CONSENT_TITLE}</p>
              {PDPA_CONSENT_SECTIONS.map((s, i) => (
                <p key={s.title} className="mt-2">
                  <span className="font-bold text-[#1e1b4b]">
                    {i + 1}. {s.title}:
                  </span>{" "}
                  {s.body}
                </p>
              ))}
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span className="text-[13px] font-semibold text-emerald-900">{PDPA_CONSENT_CHECKBOX}</span>
            </label>
            <label className="block rounded-xl border border-slate-200 bg-white p-3">
              <span className={labelClass}>เลขบัตรประชาชนของท่าน (13 หลัก) — ใช้ยืนยันตัวตนเพื่อเข้าสู่ข้อมูลของตนเอง</span>
              <input
                required
                inputMode="numeric"
                autoComplete="off"
                className={`${inputClass} text-center text-xl font-bold tracking-[0.15em]`}
                value={formatThaiId(idInput)}
                onChange={(e) => setIdInput(e.target.value.replace(/\D/g, "").slice(0, 13))}
                placeholder="x-xxxx-xxxxx-xx-x"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !consent || idInput.length !== 13}
              className={`w-full rounded-full py-2.5 text-sm font-bold disabled:opacity-40 ${brandCtaButtonClass}`}
            >
              {busy ? "กำลังตรวจสอบ…" : "ยอมรับและเข้าสู่ข้อมูลของฉัน"}
            </button>
          </form>
        ) : null}

        {step === "form" ? (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <fieldset className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
              <legend className="px-1 text-xs font-black text-sky-800">ข้อมูลทั่วไป</legend>
              <div className="flex flex-col items-center gap-2 pb-3">
                {photoPreview ? (
                  <img src={photoPreview} alt="" className="h-24 w-24 rounded-full object-cover ring-2 ring-white" />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#0000BF]/10 text-xs font-bold text-[#4d47b6]">ไม่มีรูป</div>
                )}
                <div className="flex gap-3">
                  <label className={photoBtnClass} title="เลือกรูปจากเครื่อง">
                    <GalleryIcon className="h-5 w-5" />
                    <span>เลือกจากเครื่อง</span>
                    <input type="file" accept="image/*" className="sr-only" onChange={onPhotoPick} />
                  </label>
                  <label className={photoBtnClass} title="ถ่ายรูปด้วยกล้อง">
                    <CameraIcon className="h-5 w-5" />
                    <span>ถ่ายรูป</span>
                    <input type="file" accept="image/*" capture="user" className="sr-only" onChange={onPhotoPick} />
                  </label>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className={labelClass}>ชื่อ–นามสกุล *</span>
                  <input required className={inputClass} value={f.fullName} onChange={set("fullName")} />
                </label>
                <label className="block">
                  <span className={labelClass}>เลขบัตรประชาชน</span>
                  <input disabled className={`${inputClass} bg-slate-50 text-slate-500`} value={maskedId} title="แก้ไขเลขบัตรได้ที่เจ้าหน้าที่" />
                </label>
                <label className="block">
                  <span className={labelClass}>รหัสพนักงาน</span>
                  <input className={inputClass} value={f.employeeCode} onChange={set("employeeCode")} />
                </label>
                <label className="block">
                  <span className={labelClass}>ยศ</span>
                  <input className={inputClass} value={f.rank} onChange={set("rank")} placeholder="เช่น ร.ต.ต." />
                </label>
                <label className="block">
                  <span className={labelClass}>ตำแหน่ง</span>
                  <input className={inputClass} value={f.position} onChange={set("position")} />
                </label>
                <label className="block">
                  <span className={labelClass}>สังกัด / ประเภทบุคลากร *</span>
                  <select
                    required
                    className={inputClass}
                    value={f.personnelCategoryId}
                    onChange={(e) => setF((v) => ({ ...v, personnelCategoryId: e.target.value }))}
                  >
                    <option value="">— เลือก —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={labelClass}>วันเกิด *</span>
                  <input required type="date" className={inputClass} value={f.birthDate} onChange={set("birthDate")} />
                </label>
                <label className="block">
                  <span className={labelClass}>กรุ๊ปเลือด</span>
                  <select className={inputClass} value={f.bloodType} onChange={(e) => setF((v) => ({ ...v, bloodType: e.target.value }))}>
                    <option value="">— ไม่ระบุ —</option>
                    {bloodTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className={labelClass}>โทรศัพท์</span>
                  <input inputMode="tel" className={inputClass} value={f.phone} onChange={set("phone")} />
                </label>
              </div>
            </fieldset>

            <fieldset className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
              <legend className="px-1 text-xs font-black text-emerald-800">กรมธรรม์ประกันภัย</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>บริษัทประกัน</span>
                  <input className={inputClass} value={f.insuranceCompany} onChange={set("insuranceCompany")} />
                </label>
                <label className="block">
                  <span className={labelClass}>เลขกรมธรรม์</span>
                  <input className={inputClass} value={f.insurancePolicyNumber} onChange={set("insurancePolicyNumber")} />
                </label>
                <label className="block">
                  <span className={labelClass}>วันหมดอายุ</span>
                  <input type="date" className={inputClass} value={f.insuranceExpiry} onChange={set("insuranceExpiry")} />
                </label>
                <label className="block">
                  <span className={labelClass}>หมายเหตุ</span>
                  <input className={inputClass} value={f.insuranceNotes} onChange={set("insuranceNotes")} />
                </label>
              </div>
            </fieldset>

            <fieldset className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
              <legend className="px-1 text-xs font-black text-violet-800">ผู้รับผลประโยชน์</legend>
              <div className="space-y-3">
                {f.beneficiaries.map((b, i) => (
                  <div key={i} className="grid gap-2 rounded-xl border border-white bg-white/70 p-3 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className={labelClass}>ชื่อ–นามสกุล</span>
                      <input className={inputClass} value={b.fullName} onChange={(e) => setBen(i, "fullName", e.target.value)} />
                    </label>
                    <label className="block">
                      <span className={labelClass}>ความสัมพันธ์</span>
                      <input className={inputClass} value={b.relationship} onChange={(e) => setBen(i, "relationship", e.target.value)} />
                    </label>
                    <label className="block">
                      <span className={labelClass}>โทรศัพท์</span>
                      <input inputMode="tel" className={inputClass} value={b.phone} onChange={(e) => setBen(i, "phone", e.target.value)} />
                    </label>
                    <button
                      type="button"
                      onClick={() => setF((cur) => ({ ...cur, beneficiaries: cur.beneficiaries.filter((_, j) => j !== i) }))}
                      className="justify-self-start text-[12px] font-bold text-rose-600 hover:underline"
                    >
                      ลบผู้รับผลประโยชน์นี้
                    </button>
                  </div>
                ))}
                {f.beneficiaries.length < 5 ? (
                  <button
                    type="button"
                    onClick={() => setF((cur) => ({ ...cur, beneficiaries: [...cur.beneficiaries, { fullName: "", relationship: "", phone: "", idNumber: "" }] }))}
                    className="rounded-xl border border-dashed border-violet-300 px-3 py-2 text-[13px] font-bold text-violet-700 hover:bg-violet-50"
                  >
                    + เพิ่มผู้รับผลประโยชน์
                  </button>
                ) : null}
              </div>
            </fieldset>

            <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11.5px] leading-relaxed text-slate-500">
              ข้อมูลนี้ใช้ในภารกิจขนส่งธนบัตรเท่านั้น และจะถูกทำลายอัตโนมัติเมื่อไม่มีความเคลื่อนไหวครบ 2 ปี
            </p>
            <button type="submit" disabled={busy} className={`w-full rounded-full py-3 text-sm font-bold disabled:opacity-50 ${brandCtaButtonClass}`}>
              {busy ? "กำลังบันทึก…" : "บันทึกข้อมูล"}
            </button>
          </form>
        ) : null}

        {step === "done" ? (
          <div className="mt-6 space-y-2 text-center">
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-800">
              บันทึกข้อมูลเรียบร้อยแล้ว ขอบคุณครับ/ค่ะ
            </p>
            <p className="text-[12px] text-slate-500">ปิดหน้านี้ได้ทันที — หากต้องการแก้ไขภายหลัง เปิดลิงก์เดิมแล้วใส่เลขบัตรประชาชนอีกครั้ง (ภายในอายุลิงก์)</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

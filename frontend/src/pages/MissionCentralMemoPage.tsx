import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { apiJson } from "../api/client";
import { CopyButton, CopyField, EditableText, MemoBackButton, Section, SmallInput } from "../components/CentralMemoUi";
import {
  INDENT,
  addDays,
  baht,
  defaultMissionDates,
  fullDate,
  isAssistantRole,
  isDirectorRole,
  millions,
  personName,
  rangeLabel,
  readJson,
  resolvePlaces,
  shortDate,
  toNumber,
  yearBe,
  type LocationCode,
} from "../lib/centralMemo";
import type { MissionSummary } from "../types";

type EstimateTotals = { roundedSpend: string | null; reserveAmount: string | null; approvalTotal: string | null };

type Settings = {
  to: string;
  speed: string;
  secrecy: string;
  purpose: string;
  requestingDept: string;
  originUnit: string;
  originFull: string;
  vaultLabel: string;
  budgetOwner: string;
  costLabel: string;
  reserveLabel: string;
  references: string;
  closing: string;
};

type MissionState = {
  loadDate: string;
  departDate: string;
  returnDate: string;
  roundedSpend: string;
  reserve: string;
  overrides: Record<string, string>;
};

const SETTINGS_KEY = "cit.centralMemo.v1";
const missionKey = (id: string) => `cit.centralMemo.m2.${id}`;

const DEFAULT_SETTINGS: Settings = {
  to: "ผู้ช่วยผู้ว่าการ สายวางแผนและสนับสนุนองค์กร (ผผ.)",
  speed: "ปกติ",
  secrecy: "ลับมาก",
  purpose: "อนุมัติ",
  requestingDept: "ฝ่ายจัดการธนบัตรและบริการระบบการชำระเงิน (ฝธช.)",
  originUnit: "ฝธช.",
  originFull: "ส่วนห้องมั่นคง ฝธช.",
  vaultLabel: "ห้องมั่นคงหลัก ฝธช.",
  budgetOwner: "ฝธช.",
  costLabel: "คำนวณค่าใช้จ่ายตามมติที่ประชุมร่วม ฝธช. และ ฝรภ. เป็นจำนวนเงินที่รวมค่าเบี้ยประกันแล้ว (ตัวเลขปัดกลม)",
  reserveLabel: "ประมาณการสำรองค่าใช้จ่ายครั้งนี้โดยเพิ่ม 5 %",
  references: [
    "ตามระเบียบธนาคารแห่งประเทศไทย ที่ ท 34/2550 (ประมวล 3413) เรื่อง การรักษาความปลอดภัยของธนาคารแห่งประเทศไทย ลงวันที่ 28 กันยายน 2550 ส่วนที่ 5 การขนส่งธนบัตรและทรัพย์สินมีค่าของธนาคาร",
    "ตามระเบียบธนาคารแห่งประเทศไทย ที่ ท 27/2567 เรื่อง การดำเนินการด้านธนบัตร และสิ่งพิมพ์มีค่าอื่น ลงวันที่ 1 ตุลาคม 2567 ส่วนที่ 2 การวางแผนด้านธนบัตร และสิ่งพิมพ์มีค่าอื่น ข้อ 7 การขนส่งธนบัตรใช้แลกระหว่างพื้นที่ของสายโครงสร้างพื้นฐานและบริการระบบการชำระเงิน (สพฐ.) กับ ศูนย์จัดการธนบัตร หรือ ศูนย์จัดการธนบัตร กับ ศูนย์จัดการธนบัตร หรือ สายโครงสร้างพื้นฐานและบริการระบบการชำระเงิน และ/หรือ ศูนย์จัดการธนบัตร กับ ศูนย์เงินสดกลาง ข้อ 8 การขนส่งธนบัตรใช้แลกที่อยู่ในพื้นที่เดียวกัน ให้ดำเนินการตามระเบียบ ประกาศ คำสั่ง พิธีปฏิบัติ ที่กำหนด",
    "คำสั่งฝ่ายรักษาความปลอดภัย ที่ 40/2564 เรื่อง พิธีปฏิบัติการรักษาความปลอดภัยขนส่งธนบัตรและทรัพย์สินมีค่า ลงวันที่ 17 ธันวาคม 2564",
    "บันทึกเลขที่ 5/2566 เรื่อง การปรับปรุงหลักเกณฑ์การจ่ายค่าตอบแทนและเงินสนับสนุนการรักษาความปลอดภัย หรือปฏิบัติภารกิจของ ธปท. ลงวันที่ 10 กรกฎาคม 2566",
  ].join("\n"),
  closing: "จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติการเดินทางภารกิจขนส่งธนบัตร",
};

export function MissionCentralMemoPage() {
  const { id = "" } = useParams();
  const [summary, setSummary] = useState<MissionSummary | null>(null);
  const [locations, setLocations] = useState<LocationCode[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...(readJson<Settings>(SETTINGS_KEY) ?? {}),
  }));
  const [ms, setMs] = useState<MissionState | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiJson<MissionSummary>(`/api/missions/${id}/summary`),
      apiJson<LocationCode[]>("/api/route-master/locations").catch(() => [] as LocationCode[]),
      apiJson<EstimateTotals | null>(`/api/missions/${id}/estimate`).catch(() => null),
    ])
      .then(([s, locs, est]) => {
        if (!alive) return;
        setSummary(s);
        setLocations(locs);
        const saved = readJson<MissionState>(missionKey(id));
        setMs({
          ...defaultMissionDates(s),
          roundedSpend: est?.roundedSpend ? String(Math.round(Number(est.roundedSpend))) : "",
          reserve: est?.reserveAmount ? String(Math.round(Number(est.reserveAmount))) : "",
          overrides: {},
          ...(saved ?? {}),
        });
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (ms) localStorage.setItem(missionKey(id), JSON.stringify(ms));
  }, [id, ms]);

  const gen = useMemo(() => {
    if (!summary || !ms) return null;
    const { originShort, dests } = resolvePlaces(summary, locations);
    const destCodes = dests.map((d) => d.code);

    const responsible = (summary.personnel ?? [])
      .filter((p) => isDirectorRole(p.roleName))
      .map((p) => {
        const assistant = isAssistantRole(p.roleName);
        return {
          name: personName(p),
          label: assistant ? "ผู้ช่วยผู้อำนวยการเดินทาง และกรรมการฯ" : "ผู้อำนวยการเดินทาง และกรรมการฯ",
          order: assistant ? 1 : 0,
        };
      })
      .sort((a, b) => a.order - b.order);

    const { loadDate, departDate, returnDate } = ms;
    const rounded = toNumber(ms.roundedSpend);
    const reserve = toNumber(ms.reserve);
    const total = rounded + reserve;

    const itinerary: string[] = [];
    if (loadDate && loadDate !== departDate) itinerary.push(`${shortDate(loadDate)} กรรมการโหลดสินค้าที่ ${originShort}`);
    if (departDate) itinerary.push(`${shortDate(departDate)} ออกเดินทางไป ${destCodes.join(", ")} ส่งมอบสินค้าตามกำหนด`);
    if (departDate && returnDate) {
      for (let d = addDays(departDate, 1); d && d < returnDate; d = addDays(d, 1))
        itinerary.push(`${shortDate(d)} พักฟื้นตามระเบียบกรณีเดินทางไกล`);
    }
    if (returnDate && returnDate !== departDate) itinerary.push(`${shortDate(returnDate)} ออกเดินทางกลับถึง ${originShort}`);

    const destPhrase = dests
      .map((d, i) => `${i ? "และต่อเนื่อง " : ""}ส่งมอบยัง${d.name} (${d.code}) จำนวน ${d.containers} ตู้คอนเทนเนอร์`)
      .join(" ");

    const dateRange = rangeLabel(loadDate || departDate, returnDate, " - ");
    const I1 = INDENT;
    const I2 = I1.repeat(2);
    const I3 = I1.repeat(3);
    const plan = [
      "ฝรภ. จึงได้จัดทำรายละเอียดแผนการเดินทาง และประมาณการค่าใช้จ่าย ดังต่อไปนี้",
      `${I1}(1) แผนการเดินทาง`,
      `${I2}วัน เดือน ปี : ${dateRange}`,
      `${I2}เส้นทาง : ${settings.originUnit} - ${destCodes.join(", ")}`,
      `${I2}สรุปการเดินทางเบื้องต้น`,
      ...itinerary.map((l) => `${I3}- ${l}`),
      `${I2}สรุปภารกิจ : ${settings.vaultLabel}`,
      ...dests.map((d) => `${I3}- ${d.code} จำนวน ${d.containers} ตู้ มูลค่า ${millions(d.value)} ล้านบาท`),
      `${I2}ผู้รับผิดชอบ`,
      ...responsible.map((r, i) => `${I3}${i + 1}. ${r.name} ${r.label}`),
      `${I1}(2) ค่าใช้จ่าย : ประมาณการค่าใช้จ่าย ${baht(total)} บาท (เอกสารแนบ 2)`,
      `${I2}1. ${settings.costLabel} จำนวน ${baht(rounded)} บาท`,
      `${I2}2. ${settings.reserveLabel} จำนวน ${baht(reserve)} บาท`,
      `${I2}รวมประมาณการขออนุมัติค่าใช้จ่ายครั้งนี้ จำนวน ${baht(total)} บาท`,
      `${I2}หมายเหตุ : เดินทางไปส่งทรัพย์สินที่ ${dests.map((d) => `${d.code} จำนวน ${d.containers} ตู้`).join(" ต่อเนื่อง ")} ทั้งนี้งบประมาณค่าใช้จ่ายดังกล่าว เป็นงบประมาณประจำปี ${yearBe(departDate || loadDate)} ของ ${settings.budgetOwner} ที่ได้รับอนุมัติตามแผนงานแล้ว`,
    ].join("\n");

    return {
      subject: `ภารกิจขนส่งธนบัตรจาก ${originShort} ไป ${destCodes.join(",")}`,
      background: `${INDENT}${settings.requestingDept} กำหนดให้มีภารกิจขนส่งธนบัตร จาก ${settings.originFull} ${destPhrase} โดยโหลดทรัพย์สินวันที่ ${fullDate(loadDate || departDate)} ออกเดินทางส่งมอบทรัพย์สินในวันที่ ${fullDate(departDate)} (เอกสารแนบ 1) และเดินทางกลับ ${originShort} ในวันที่ ${fullDate(returnDate)}`,
      plan,
      conclusion: `${INDENT}ภารกิจขนส่งธนบัตร จาก ${settings.originUnit} ส่งมอบทรัพย์สิน ${dests
        .map((d, i) => `${i ? "ต่อเนื่อง " : ""}${d.code} จำนวน ${d.containers} ตู้คอนเทนเนอร์ (${millions(d.value)} ล้านบาท)`)
        .join(" ")} โดยมี ผู้รับผิดชอบ ${responsible.map((r) => `${r.name} ${r.label}`).join(" และ ")} ระหว่างวันที่ ${rangeLabel(loadDate || departDate, returnDate, "-")} โดยประมาณการค่าใช้จ่าย ${baht(total)} บาท\n${INDENT}${settings.closing}`,
      warnings: [
        !dests.length ? "ภารกิจยังไม่มีจุดส่งสินค้า" : null,
        !responsible.length ? "ยังไม่ได้กำหนดบุคลากรหน้าที่ «ผอ.เดินทาง» / «ผช.ผอ.เดินทาง»" : null,
        !total ? "ยังไม่มียอดประมาณการค่าใช้จ่าย — กรอกที่ช่องด้านบน" : null,
      ].filter((w): w is string => Boolean(w)),
    };
  }, [summary, ms, locations, settings]);

  const back = <MemoBackButton fallback={`/missions/${id}/summary`} />;

  if (err) return <div className="space-y-4">{back}<p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</p></div>;
  if (!summary || !ms || !gen) return <div className="space-y-4">{back}<p className="text-sm text-slate-500">กำลังเตรียมข้อมูล…</p></div>;

  const text = (key: string, generated: string) => ms.overrides[key] ?? generated;
  const setOverride = (key: string, value: string | null) =>
    setMs((cur) => {
      if (!cur) return cur;
      const overrides = { ...cur.overrides };
      if (value === null) delete overrides[key];
      else overrides[key] = value;
      return { ...cur, overrides };
    });
  const setSetting = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setSettings((s) => ({ ...s, [k]: e.target.value }));

  const refLines = settings.references.split("\n").filter((s) => s.trim());
  const referencesText = refLines.some((s) => /^\s*\d+\./.test(s))
    ? settings.references
    : refLines.map((s, i) => `${INDENT}${i + 1}. ${s.trim()}`).join("\n");
  const planText = text("plan", gen.plan);

  const allText = [
    `เรียน ${settings.to}`,
    `เรื่อง ${text("subject", gen.subject)}`,
    "",
    "1. ความเป็นมา",
    text("background", gen.background),
    "",
    "2. หลักเกณฑ์อ้างอิง",
    referencesText,
    "",
    "3. ข้อมูลประกอบการพิจารณา",
    planText,
    "",
    "4. ข้อสรุปประเด็นเพื่อทราบ/พิจารณา",
    text("conclusion", gen.conclusion),
  ].join("\n");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {back}
        <CopyButton label="คัดลอกทั้งฉบับ" text={allText} primary />
      </div>

      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="font-mono text-xs font-bold tracking-wide text-indigo-600">{summary.code}</p>
        <h1 className="mt-1 text-xl font-black text-slate-900">ระบบกลาง: บันทึกขออนุมัติภารกิจ</h1>
        <p className="mt-1 text-sm text-slate-500">
          ระบบเติมข้อความจากข้อมูลภารกิจให้อัตโนมัติ กด «คัดลอก» ทีละส่วนแล้วนำไปวางในช่องเดียวกันของระบบกลาง แก้ข้อความในกล่องได้ก่อนคัดลอก
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <SmallInput label="วันโหลดทรัพย์สิน" type="date" value={ms.loadDate} onChange={(v) => setMs({ ...ms, loadDate: v })} />
          <SmallInput label="วันออกเดินทาง" type="date" value={ms.departDate} onChange={(v) => setMs({ ...ms, departDate: v })} />
          <SmallInput label="วันเดินทางกลับ" type="date" value={ms.returnDate} onChange={(v) => setMs({ ...ms, returnDate: v })} />
          <SmallInput label="ค่าใช้จ่าย (ปัดกลม) บาท" value={ms.roundedSpend} onChange={(v) => setMs({ ...ms, roundedSpend: v })} />
          <SmallInput label="สำรองค่าใช้จ่าย บาท" value={ms.reserve} onChange={(v) => setMs({ ...ms, reserve: v })} />
        </div>

        {gen.warnings.length ? (
          <ul className="mt-3 list-disc rounded-xl border border-amber-200 bg-amber-50 py-2 pl-8 pr-3 text-[13px] text-amber-900">
            {gen.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">ค่าตั้งต้นหน่วยงาน (จำไว้ใช้ทุกภารกิจ)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <SmallInput label="ส่วนงานผู้กำหนดภารกิจ (ความเป็นมา)" value={settings.requestingDept} onChange={(v) => setSettings({ ...settings, requestingDept: v })} />
            <SmallInput label="ต้นทาง (ความเป็นมา)" value={settings.originFull} onChange={(v) => setSettings({ ...settings, originFull: v })} />
            <SmallInput label="หน่วยงานต้นทาง (ย่อ)" value={settings.originUnit} onChange={(v) => setSettings({ ...settings, originUnit: v })} />
            <SmallInput label="จุดต้นทางในสรุปภารกิจ" value={settings.vaultLabel} onChange={(v) => setSettings({ ...settings, vaultLabel: v })} />
            <SmallInput label="เจ้าของงบประมาณ" value={settings.budgetOwner} onChange={(v) => setSettings({ ...settings, budgetOwner: v })} />
            <SmallInput label="ข้อความปิดท้าย" value={settings.closing} onChange={(v) => setSettings({ ...settings, closing: v })} />
            <SmallInput label="รายการค่าใช้จ่ายลำดับ 1" value={settings.costLabel} onChange={(v) => setSettings({ ...settings, costLabel: v })} wide />
            <SmallInput label="รายการค่าใช้จ่ายลำดับ 2" value={settings.reserveLabel} onChange={(v) => setSettings({ ...settings, reserveLabel: v })} wide />
          </div>
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-rose-600 hover:underline"
            onClick={() => confirm("คืนค่าตั้งต้นหน่วยงานทั้งหมด?") && setSettings(DEFAULT_SETTINGS)}
          >
            คืนค่าตั้งต้น
          </button>
        </details>
      </header>

      <Section n="ส่วนหัว" title="ข้อมูลหัวบันทึก">
        <div className="grid gap-2 sm:grid-cols-2">
          <CopyField label="เรียน" value={settings.to} onChange={setSetting("to")} />
          <CopyField label="เพื่อ" value={settings.purpose} onChange={setSetting("purpose")} />
          <CopyField label="ชั้นความเร็ว" value={settings.speed} onChange={setSetting("speed")} />
          <CopyField label="ชั้นความลับ" value={settings.secrecy} onChange={setSetting("secrecy")} />
        </div>
        <div className="mt-2">
          <CopyField
            label="เรื่อง"
            value={text("subject", gen.subject)}
            onChange={(e) => setOverride("subject", e.target.value)}
            edited={"subject" in ms.overrides}
            onReset={() => setOverride("subject", null)}
          />
        </div>
      </Section>

      <Section n="1" title="ความเป็นมา" copyText={text("background", gen.background)}>
        <EditableText
          value={text("background", gen.background)}
          onChange={(v) => setOverride("background", v)}
          edited={"background" in ms.overrides}
          onReset={() => setOverride("background", null)}
          rows={5}
        />
      </Section>

      <Section n="2" title="หลักเกณฑ์อ้างอิง" copyText={referencesText} hint="ข้อความนี้จำไว้ใช้ทุกภารกิจ">
        <textarea
          rows={10}
          value={referencesText}
          onChange={setSetting("references")}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 focus:border-indigo-300 focus:outline-none"
        />
      </Section>

      <Section n="3" title="ข้อมูลประกอบการพิจารณา — (1) แผนการเดินทาง (2) ค่าใช้จ่าย" copyText={planText}>
        <EditableText
          value={planText}
          onChange={(v) => setOverride("plan", v)}
          edited={"plan" in ms.overrides}
          onReset={() => setOverride("plan", null)}
          rows={planText.split("\n").length + 1}
        />
      </Section>

      <Section n="4" title="ข้อสรุปประเด็นเพื่อทราบ/พิจารณา" copyText={text("conclusion", gen.conclusion)}>
        <EditableText
          value={text("conclusion", gen.conclusion)}
          onChange={(v) => setOverride("conclusion", v)}
          edited={"conclusion" in ms.overrides}
          onReset={() => setOverride("conclusion", null)}
          rows={5}
        />
      </Section>
    </div>
  );
}

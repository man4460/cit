/** วิเคราะห์สาเหตุเหตุการณ์ไม่ปกติจากข้อความอิสระ (จัดกลุ่มด้วยคีย์เวิร์ด — ไม่ใช้ AI) */

export type AnalysisIncident = {
  title: string;
  location: string | null;
  incidentType: string | null;
  statusResolved: boolean;
  cause: string | null;
  details: string | null;
  /** เวลาเหตุการณ์ — เก็บเป็นเวลาไทยในฟิลด์ UTC จึงอ่านด้วย getUTC* */
  ref: Date;
  monthIndex: number;
};

type CauseRule = { key: string; label: string; why: string; recommend: string; re: RegExp };

/** ลำดับมีผล: กฎแรกที่ตรงจะถูกใช้ */
const CAUSE_RULES: CauseRule[] = [
  {
    key: "insect",
    label: "แมลง / สัตว์เข้าอุปกรณ์",
    why: "มด แมลง หรือสัตว์เล็กเข้าไปในช่องตรวจจับ ทำให้ Sensor อ่านค่าเหมือนมีควัน",
    recommend: "กำจัดแมลงรอบจุดติดตั้ง ซีลรู/ติดตาข่ายกันแมลงที่หัว Detector และตรวจจุดที่เกิดซ้ำ",
    re: /(?<![หโ])มด(?!ู)|แมลง|จิ้งจก|ตุ๊กแก|นกพิราบ|นกเข้า|หนู|สัตว์|แมงมุม|ปลวก/i,
  },
  {
    key: "activity",
    label: "ควัน / ละอองจากกิจกรรม",
    why: "ควันหรือละอองจากการทำอาหาร ฉีดพ่นสารเคมี หรือการเผา ลอยเข้าหัว Detector",
    recommend: "ควบคุมกิจกรรมที่ก่อควัน/ละอองใกล้หัว Detector และพิจารณาใช้ Heat Detector ในครัว/พื้นที่เสี่ยง",
    re: /ควัน|ธูป|อาหาร|ทอด|ปิ้ง|บุหรี่|เผา|สเปรย์|แอลกอฮอล์|ไมโครเวฟ|ไมรโครเวฟ|(?<!เพลิง)ไหม้|หมอก|ฉีดพ่น|พ่นยา|กำจัดยุง/i,
  },
  {
    key: "work",
    label: "งานซ่อม / ติดตั้ง / ทดสอบระบบ",
    why: "ฝุ่นหรือการรบกวนจากงานซ่อม เจียร เชื่อม ก่อสร้าง หรือช่างเข้าทดสอบระบบโดยไม่ได้ Bypass โซน",
    recommend: "บังคับขอ Permit to Work และ Bypass/คลุมหัว Detector ก่อนเริ่มงาน แจ้งห้องควบคุมล่วงหน้าทุกครั้ง",
    re: /ซ่อมแซม|เจียร|เชื่อม|ทาสี|ก่อสร้าง|ปรับปรุง|รื้อ|ขัดพื้น|ขัดสี|เจาะ|ผู้รับเหมา|สั่นสะเทือน|ขวางแนว/i,
  },
  {
    key: "dirty",
    label: "หัว Detector สกปรก / ฝุ่นสะสม",
    why: "ฝุ่นสะสมในห้องตรวจจับทำให้ Sensor ไวเกินปกติ จนแจ้งเหตุทั้งที่ไม่มีควัน",
    recommend: "เพิ่มรอบ PM ทำความสะอาดหัว Smoke โดยเฉพาะจุดที่เกิดซ้ำ และเปลี่ยนหัวที่อายุการใช้งานมาก",
    re: /สกปรก|สกปก|ฝุ่น|ไม่สะอาด|ผง/i,
  },
  {
    key: "humid",
    label: "ความชื้น / ละอองน้ำ / น้ำรั่ว",
    why: "ความชื้นสูงหรือละอองน้ำเกาะ Sensor/แนว Beam ทำให้อ่านค่าเป็นควัน มักเกิดช่วงฝนตกหรือพื้นที่ปิดอับ",
    recommend: "ตรวจซ่อมจุดน้ำรั่วหลังคา ปรับระบบระบายอากาศ และเลือกชนิด Detector ให้เหมาะกับพื้นที่ชื้น",
    re: /ชื้น|ชื่น|ละออง|ไอน้ำ|น้ำรั่ว|น้ำหยด|น้ำฝน|ฝน|รั่วซึม|หยด|น้ำโดน|น้ำเข้า|ฝ้า|ควบแน่น|น้ำค้าง/i,
  },
  {
    key: "work",
    label: "งานซ่อม / ติดตั้ง / ทดสอบระบบ",
    why: "ฝุ่นหรือการรบกวนจากงานซ่อม เจียร เชื่อม ก่อสร้าง หรือช่างเข้าทดสอบระบบโดยไม่ได้ Bypass โซน",
    recommend: "บังคับขอ Permit to Work และ Bypass/คลุมหัว Detector ก่อนเริ่มงาน แจ้งห้องควบคุมล่วงหน้าทุกครั้ง",
    re: /ซ่อม|ทดสอบ|บำรุงรักษา|\bPM\b|ติดตั้ง|สอนงาน|เข้าแก้ไข/i,
  },
  {
    key: "broken",
    label: "อุปกรณ์ / ระบบขัดข้อง",
    why: "อุปกรณ์เสื่อมสภาพ สายสัญญาณมีปัญหา หรือระบบไฟฟ้าผิดปกติ ทำให้ส่งสัญญาณผิดพลาด",
    recommend: "เปลี่ยนอุปกรณ์ที่ชำรุด ตรวจสายสัญญาณ/Module และวางแผนเปลี่ยนอุปกรณ์ตามอายุใช้งาน",
    re: /ชำรุด|เสื่อม|หมดอายุ|ขัดข้อง|ขัอข้อง|บกพร่อง|ผิดปกติ|ผิดพลาด|ลัดวงจร|short|ช็อต|ช๊อต|สายไฟ|สายสัญญาณ|แบตเตอรี่|ไฟตก|ไฟดับ|ไฟกระชาก|error|trouble|troble|truble|มีปัญหา|เลื่อน|reset\s*ไม่ได้|ไม่สามารถ\s*(reset|รีเซ็ท)|fm\s*200|novec|vesda|flow\s*low|supervisory|module|ค้าง/i,
  },
  {
    key: "human",
    label: "บุคคลกด / ทำผิดพลาด",
    why: "มีผู้กดอุปกรณ์แจ้งเหตุหรือชนอุปกรณ์โดยไม่ตั้งใจ",
    recommend: "ติดฝาครอบ Manual Call Point และสื่อสาร/อบรมผู้ใช้พื้นที่",
    re: /กดปุ่ม|กดผิด|กด\s*break|กด\s*manual|เผลอ|เดินชน|ชนอุปกรณ์|กระแทก|เด็ก|ไม่ระวัง/i,
  },
  {
    key: "unknown",
    label: "ไม่ทราบ / ไม่ระบุสาเหตุ",
    why: "บันทึกเพียงว่าเกิดสัญญาณ หรือช่างยังหาสาเหตุไม่พบ — ทำให้วิเคราะห์ต่อไม่ได้",
    recommend: "กำหนดให้ช่างระบุสาเหตุที่แท้จริงทุกครั้งหลังตรวจสอบ และติดตามเหตุที่ยังไม่ทราบสาเหตุ",
    re: /.*/,
  },
];

const DEVICE_RULES: Array<{ name: string; re: RegExp }> = [
  { name: "Beam Detector", re: /beam/i },
  { name: "VESDA / High Sensitivity", re: /vesda|high\s*sensitiv|hssd/i },
  { name: "Heat Detector", re: /heat/i },
  { name: "Gas Detector", re: /\bgas\b|แก๊ส|แก็ส/i },
  { name: "Manual / Break Glass", re: /break\s*glass|manual|call\s*point|key\s*switch/i },
  { name: "ระบบดับเพลิง (FM200 / Novec / Sprinkler)", re: /fm\s*200|novec|sprinkler|preaction|flow|fire\s*pump/i },
  { name: "Smoke Detector", re: /smo(k|ck)e?|สโมค|สโม๊ค/i },
];

const MONTH_LABELS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const WEEKDAY_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const RAINY_MONTHS = new Set([4, 5, 6, 7, 8, 9]);

function classifyCause(cause: string): CauseRule {
  const text = cause.trim();
  const unknown = CAUSE_RULES[CAUSE_RULES.length - 1]!;
  if (!text || /^-?\s*(false\s*alarm|ไม่มี|-)\s*$/i.test(text)) return unknown;
  if (/ไม่ทราบ|ไม่พบสาเหตุ|ยังไม่พบ|ไม่สามารถระบุ/i.test(text) && !/สกปรก|ฝุ่น|ชื้น|มด|แมลง/i.test(text)) return unknown;
  return CAUSE_RULES.find((r) => r.re.test(text)) ?? unknown;
}

function classifyDevice(text: string) {
  return DEVICE_RULES.find((d) => d.re.test(text))?.name ?? "ไม่ระบุอุปกรณ์";
}

/** ตัดคำนำหน้าที่ไม่มีความหมาย เพื่อรวมข้อความสาเหตุที่เขียนต่างกันเล็กน้อย */
function causeKey(cause: string) {
  return cause
    .toLowerCase()
    .normalize("NFC")
    .replace(/สาเหตุของเหตุการณ์ไม่ปกติ|ช่าง\S*\s*แจ้งว่า|สาเหตุ(ว่า)?|เกิดจาก|เนื่องจาก|สันนิษฐานว่า|คาดว่า|หัว|ระบบ/g, "")
    .replace(/detector|detecto/g, "")
    .replace(/สกปก/g, "สกปรก")
    .replace(/[\s\-.,()]+/g, "");
}

function placeKey(r: AnalysisIncident) {
  const text = `${r.title} ${r.details ?? ""}`.replace(/\s+/g, " ");
  const loc = (r.location ?? "").trim();
  const bld = /อาคาร\s*([0-9]+|[\u0E00-\u0E7FA-Za-z0-9.]+)/.exec(text);
  if (bld) {
    const name = /^[0-9]+$/.test(bld[1]!) ? `อาคาร ${bld[1]}` : `อาคาร${bld[1]}`;
    const floor = /ชั้น\s*\.?\s*([0-9]+|G)\b/i.exec(text.slice(bld.index));
    return [loc, name + (floor ? ` ชั้น ${floor[1]}` : "")].filter(Boolean).join(" · ");
  }
  const room = /ห้อง\s*([\u0E00-\u0E7FA-Za-z0-9]+)/.exec(text);
  if (room) return [loc, `ห้อง${room[1]}`].filter(Boolean).join(" · ");
  return null;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const fmt = (n: number) => n.toLocaleString("th-TH");

export function analyzeIncidents(rows: AnalysisIncident[], totalInScope: number) {
  const total = rows.length;
  const groups = new Map<string, { rule: CauseRule; count: number; open: number; examples: Map<string, { text: string; count: number }>; places: Map<string, number>; rainy: number }>();
  const devices = new Map<string, number>();
  const places = new Map<string, { count: number; causes: Map<string, number>; open: number }>();
  const hours = Array(24).fill(0) as number[];
  const weekdays = Array(7).fill(0) as number[];
  const months = Array(12).fill(0) as number[];
  let open = 0;

  for (const r of rows) {
    const cause = (r.cause ?? "").trim();
    const rule = classifyCause(cause);
    const g = groups.get(rule.key) ?? { rule, count: 0, open: 0, examples: new Map(), places: new Map(), rainy: 0 };
    g.count += 1;
    if (!r.statusResolved) {
      g.open += 1;
      open += 1;
    }
    if (RAINY_MONTHS.has(r.monthIndex)) g.rainy += 1;
    if (cause) {
      const k = causeKey(cause) || cause;
      const ex = g.examples.get(k) ?? { text: cause.replace(/\s+/g, " ").slice(0, 160), count: 0 };
      ex.count += 1;
      g.examples.set(k, ex);
    }
    groups.set(rule.key, g);

    const dev = classifyDevice(`${r.title} ${cause} ${r.details ?? ""}`);
    devices.set(dev, (devices.get(dev) ?? 0) + 1);

    const pk = placeKey(r);
    if (pk) {
      const p = places.get(pk) ?? { count: 0, causes: new Map(), open: 0 };
      p.count += 1;
      if (!r.statusResolved) p.open += 1;
      p.causes.set(rule.label, (p.causes.get(rule.label) ?? 0) + 1);
      places.set(pk, p);
      g.places.set(pk, (g.places.get(pk) ?? 0) + 1);
    }

    hours[r.ref.getUTCHours()] += 1;
    weekdays[r.ref.getUTCDay()] += 1;
    months[r.monthIndex] += 1;
  }

  const topOf = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);

  const causeGroups = [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .map((g) => ({
      key: g.rule.key,
      label: g.rule.label,
      why: g.rule.why,
      recommend: g.rule.recommend,
      count: g.count,
      open: g.open,
      rainy: g.rainy,
      examples: [...g.examples.values()].sort((a, b) => b.count - a.count).slice(0, 4),
      topPlaces: topOf(g.places)
        .slice(0, 3)
        .map(([name, count]) => ({ name, count })),
    }));

  const hotspots = [...places.entries()]
    .filter(([, p]) => p.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, p]) => ({ name, count: p.count, open: p.open, topCause: topOf(p.causes)[0]?.[0] ?? "—" }));

  const deviceList = topOf(devices).map(([name, count]) => ({ name, count }));

  let peakStart = 0;
  let peakSum = -1;
  for (let h = 0; h < 24; h += 1) {
    const s = hours[h]! + hours[(h + 1) % 24]! + hours[(h + 2) % 24]!;
    if (s > peakSum) {
      peakSum = s;
      peakStart = h;
    }
  }
  const nightCount = hours.reduce((s, v, h) => (h >= 18 || h < 6 ? s + v : s), 0);

  const insights: string[] = [];
  if (total > 0) {
    const [g1, g2, g3] = causeGroups;
    if (g1) insights.push(`สาเหตุอันดับ 1 คือ "${g1.label}" ${fmt(g1.count)} ครั้ง (${pct(g1.count, total)}%) — ${g1.why}`);
    if (g2 && g3) {
      const top3 = g1!.count + g2.count + g3.count;
      insights.push(
        `3 สาเหตุแรก (${g1!.label}, ${g2.label}, ${g3.label}) รวม ${pct(top3, total)}% — แก้ 3 เรื่องนี้จะลดเหตุได้มากที่สุด`,
      );
    }
    const dev = deviceList.find((d) => d.name !== "ไม่ระบุอุปกรณ์");
    if (dev) insights.push(`อุปกรณ์ที่แจ้งเหตุบ่อยที่สุดคือ ${dev.name} ${fmt(dev.count)} ครั้ง (${pct(dev.count, total)}%)`);
    const h1 = hotspots[0];
    if (h1) {
      const repeatEvents = hotspots.reduce((s, h) => s + h.count, 0);
      insights.push(
        `จุดที่เกิดซ้ำมากที่สุด: ${h1.name} ${fmt(h1.count)} ครั้ง (สาเหตุหลัก: ${h1.topCause}) · มี ${fmt(hotspots.length)} จุดที่เกิดซ้ำตั้งแต่ 2 ครั้ง รวม ${pct(repeatEvents, total)}% ของเหตุ`,
      );
    }
    const pad = (h: number) => String(h % 24).padStart(2, "0");
    insights.push(
      `ช่วงเวลาที่เกิดบ่อย: ${pad(peakStart)}:00–${pad(peakStart + 3)}:00 น. (${fmt(peakSum)} ครั้ง) · กลางคืน 18:00–06:00 น. ${pct(nightCount, total)}%`,
    );
    const mPeak = months.indexOf(Math.max(...months));
    const wPeak = weekdays.indexOf(Math.max(...weekdays));
    insights.push(`เดือนที่เกิดมากที่สุด: ${MONTH_LABELS_TH[mPeak]} (${fmt(months[mPeak]!)}) · วันที่เกิดบ่อย: วัน${WEEKDAY_TH[wPeak]}`);
    const humid = causeGroups.find((g) => g.key === "humid");
    if (humid && humid.count >= 3) {
      insights.push(`เหตุจากความชื้น ${pct(humid.rainy, humid.count)}% เกิดในฤดูฝน (พ.ค.–ต.ค.) — ควรตรวจจุดรั่วซึมก่อนเข้าฤดูฝน`);
    }
    const unknown = causeGroups.find((g) => g.key === "unknown");
    if (unknown && pct(unknown.count, total) >= 10) {
      insights.push(`${pct(unknown.count, total)}% ของเหตุไม่ระบุ/ไม่ทราบสาเหตุ — ควรให้ช่างบันทึกสาเหตุที่แท้จริงเพื่อป้องกันการเกิดซ้ำ`);
    }
  }

  return {
    total,
    totalInScope,
    open,
    causeGroups,
    devices: deviceList,
    hotspots: hotspots.slice(0, 15),
    hours,
    weekdays,
    months,
    insights,
  };
}

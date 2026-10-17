/**
 * % ปริมาณน้ำท่าตามรายงาน EWI = Q / Qmax เท่านั้น
 * ห้ามใช้ storage_percent (% ความจุจากระดับน้ำ) เป็นเกณฑ์ — คนละความหมาย
 */

export type LevelLike = {
  name?: string;
  code?: string;
  q?: number | null;
  qmax?: number | null;
  qPct?: number | null;
  id?: number | null;
  msl?: number | null;
  time?: string | null;
};

export type RunoffProxy = {
  name: string;
  code: string;
  q: number;
  qmax: number;
  qPct: number;
  time: string | null;
  note: string;
};

type Alt = { code?: string; name?: string; note: string };

/** จุดที่ไม่มี Q/Qmax — ใช้สถานีใกล้เคียงที่มีเส้นความจุน้ำท่าจริง (ระบุ note เสมอ) */
const PROXY_BY_KEY: Record<string, Alt> = {
  /* สกอ. — ลำน้ำพองมี Q แต่ไม่มี qmax → ใช้บ้านท่าเม่า อ.น้ำพอง */
  URTD02: { code: "E.22B", name: "บ้านท่าเม่า", note: "สถานีใกล้เคียง อ.น้ำพอง ที่มี Q/Qmax (ลำน้ำพอง)" },
  "ลำน้ำพอง โรงเรียนลำน้ำพอง": { code: "E.22B", name: "บ้านท่าเม่า", note: "สถานีใกล้เคียง อ.น้ำพอง ที่มี Q/Qmax (ลำน้ำพอง)" },
  /* ศอบ. — PMTS16 มี Q แต่ไม่มี qmax และ Q ไม่เข้าคู่กับ qmax ของ M.7 (ห้ามยืม qmax อย่างเดียว)
     ใช้คู่ Q/Qmax ทั้งชุดจากสะพานเสรีฯ M.7 */
  PMTS16: {
    code: "M.7",
    name: "สะพานเสรีประชาธิปไตย",
    note: "ใช้คู่ Q/Qmax ทั้งชุดจาก M.7 สะพานเสรีฯ (ห้ามผสม Q ของ PMTS16 กับ qmax ของ M.7)",
  },
  "แม่น้ำมูล เมืองอุบลราชธานี (M.7)": {
    code: "M.7",
    name: "สะพานเสรีประชาธิปไตย",
    note: "ใช้คู่ Q/Qmax ทั้งชุดจาก M.7 สะพานเสรีฯ (ห้ามผสม Q ของ PMTS16 กับ qmax ของ M.7)",
  },
  /* ศอบ. — คันไร่มี Q ไม่มี qmax */
  PMTS15: { code: "M.11B", name: "บ้านโพธิ์ตาก", note: "สถานีใกล้เคียงแม่น้ำมูล อ.พิบูลมังสาหาร ที่มี Q/Qmax" },
  "แม่น้ำมูล บ้านคันไร่": { code: "M.11B", name: "บ้านโพธิ์ตาก", note: "สถานีใกล้เคียงแม่น้ำมูล อ.พิบูลมังสาหาร ที่มี Q/Qmax" },
  /* ศอบ. — วัดปากโดมไม่มี Q */
  PMTS4: { code: "M.7", name: "สะพานเสรีประชาธิปไตย", note: "สถานี M.7 ใกล้เมืองอุบล ที่มี Q/Qmax (แทนวัดปากโดมที่ไม่มีปริมาณน้ำท่า)" },
  "แม่น้ำมูล วัดปากโดม": {
    code: "M.7",
    name: "สะพานเสรีประชาธิปไตย",
    note: "สถานี M.7 ใกล้เมืองอุบล ที่มี Q/Qmax (แทนวัดปากโดมที่ไม่มีปริมาณน้ำท่า)",
  },
  /* ศพล. — ไม่มี Q ที่จุดเหล่านี้ */
  DIV004: { code: "N.5A", name: "สะพานสุพรรณกัลยา", note: "สถานีแม่น้ำน่านในเมืองพิษณุโลก ที่มี Q/Qmax" },
  "คลองผันน้ำยม-น่าน4": { code: "N.5A", name: "สะพานสุพรรณกัลยา", note: "สถานีแม่น้ำน่านในเมืองพิษณุโลก ที่มี Q/Qmax" },
  NAN012: { code: "N.5A", name: "สะพานสุพรรณกัลยา", note: "สถานีแม่น้ำน่านในเมืองพิษณุโลก ที่มี Q/Qmax" },
  เมืองพิษณุโลก: { code: "N.5A", name: "สะพานสุพรรณกัลยา", note: "สถานีแม่น้ำน่านในเมืองพิษณุโลก ที่มี Q/Qmax" },
  /* ศรย. — บ้านค่ายไม่มี Q → ใช้บ้านเขาโบสถ์ (ใกล้ที่ตั้ง ศรย. ที่สุดในชุดที่มี Q/Qmax) */
  RAY004: { code: "Z.38", name: "บ้านเขาโบสถ์", note: "สถานีใกล้ที่ตั้ง ศรย. ที่มี Q/Qmax (บ้านค่ายไม่มีปริมาณน้ำท่าในคลัง)" },
  บ้านค่าย: { code: "Z.38", name: "บ้านเขาโบสถ์", note: "สถานีใกล้ที่ตั้ง ศรย. ที่มี Q/Qmax (บ้านค่ายไม่มีปริมาณน้ำท่าในคลัง)" },
  /* ศสร. — ท่าข้าม/ท่าขนอม ไม่มี Q/Qmax ในคลัง · ใกล้สุดที่มีคือบ้านเคียนซา (X.217 ~31 กม.) */
  "X.5C": {
    code: "X.217",
    name: "บ้านเคียนซา",
    note: "บ้านท่าข้าม (X.5C) ยังไม่มี Q/Qmax ในคลัง — ใช้บ้านเคียนซาซึ่งใกล้ที่ตั้งที่สุดในลุ่มที่มีปริมาณน้ำท่า",
  },
  บ้านท่าข้าม: {
    code: "X.217",
    name: "บ้านเคียนซา",
    note: "บ้านท่าข้าม (X.5C) ยังไม่มี Q/Qmax ในคลัง — ใช้บ้านเคียนซาซึ่งใกล้ที่ตั้งที่สุดในลุ่มที่มีปริมาณน้ำท่า",
  },
  TPI004: {
    code: "X.217",
    name: "บ้านเคียนซา",
    note: "ท่าขนอมยังไม่มี Q/Qmax ในคลัง — ใช้บ้านเคียนซา (ลุ่มตาปี) ที่มีปริมาณน้ำท่า",
  },
  ท่าขนอม: {
    code: "X.217",
    name: "บ้านเคียนซา",
    note: "ท่าขนอมยังไม่มี Q/Qmax ในคลัง — ใช้บ้านเคียนซา (ลุ่มตาปี) ที่มีปริมาณน้ำท่า",
  },
};

export function runoffPctStrict(l: LevelLike | null | undefined): number | null {
  if (!l) return null;
  if (typeof l.qPct === "number" && Number.isFinite(l.qPct)) return l.qPct;
  const q = typeof l.q === "number" && Number.isFinite(l.q) ? l.q : null;
  const qmax = typeof l.qmax === "number" && Number.isFinite(l.qmax) ? l.qmax : null;
  if (q != null && qmax != null && qmax > 0) return Math.round((q / qmax) * 1000) / 10;
  return null;
}

function lookup(levels: LevelLike[], code?: string, name?: string): LevelLike | undefined {
  if (code) {
    const byCode = levels.find((l) => l.code === code);
    if (byCode) return byCode;
  }
  if (name) return levels.find((l) => l.name === name);
  return undefined;
}

/** สถานีที่ Q ในคลังเพี้ยน/ไม่เข้าคู่ qmax — ห้ามคำนวณ Q/Qmax ของตน ใช้ proxy ทั้งชุดเท่านั้น */
const FORCE_PROXY_KEYS = new Set(["PMTS16", "แม่น้ำมูล เมืองอุบลราชธานี (M.7)"]);

/**
 * คำนวณ qPct = Q/Qmax ของสถานีเองเท่านั้น
 * ห้ามยืม qmax จากสถานีอื่นมาผสมกับ Q ของตน (เคยทำให้ PMTS16 = 1800/2300 ≈ 78% ปลอม
 * ในขณะที่ M.7 จริง = 383/2300 ≈ 17%)
 * ถ้าขาดคู่ Q/Qmax หรืออยู่ใน FORCE_PROXY → ใช้ proxy ทั้งชุดจากสถานีใกล้เคียง
 */
export function enrichLevelsRunoff<T extends LevelLike>(levels: T[]): (T & { runoffProxy?: RunoffProxy | null })[] {
  const out = levels.map((l) => ({ ...l })) as (T & { qPct: number | null; qmax: number | null; runoffProxy?: RunoffProxy | null })[];

  for (const l of out) {
    const force = FORCE_PROXY_KEYS.has(l.code || "") || FORCE_PROXY_KEYS.has(l.name || "");
    /* ใช้เฉพาะ qmax ของสถานีเอง — ไม่แชร์ข้ามสถานี · FORCE_PROXY ไม่คำนวณของตน */
    l.qPct = force ? null : runoffPctStrict({ q: l.q, qmax: l.qmax, qPct: null });
    l.runoffProxy = null;
  }

  for (const l of out) {
    if (l.qPct != null) continue;
    const alt = (l.code && PROXY_BY_KEY[l.code]) || (l.name && PROXY_BY_KEY[l.name]);
    if (!alt) continue;
    const src = lookup(out, alt.code, alt.name);
    const qp = runoffPctStrict(src);
    if (!src || qp == null || src.q == null || src.qmax == null) continue;
    l.runoffProxy = {
      name: src.name || alt.name || "",
      code: src.code || alt.code || "",
      q: src.q,
      qmax: src.qmax,
      qPct: qp,
      time: src.time ?? null,
      note: alt.note,
    };
  }
  return out;
}

/** ประมาณ % น้ำท่าจาก % ความจุตลิ่ง (Manning Q∝h^(5/3)) — เมื่อคลังไม่มีค่า Q */
export function estRunoffFromStoragePct(storagePct: number | null | undefined): number | null {
  if (storagePct == null || !Number.isFinite(storagePct)) return null;
  return Math.round(Math.pow(Math.max(storagePct, 0) / 100, 5 / 3) * 1000) / 10;
}

/** อ่าน % น้ำท่าสำหรับเกณฑ์: ของสถานีเองก่อน แล้วค่อย proxy · opts.allowEstimate = ประมาณจาก % ตลิ่งเมื่อไม่มี Q */
export function runoffPctOf(
  l: (LevelLike & { runoffProxy?: RunoffProxy | null; storagePct?: number | null }) | null | undefined,
  opts?: { allowEstimate?: boolean },
): number | null {
  if (!l) return null;
  const own = runoffPctStrict(l);
  if (own != null) return own;
  if (l.runoffProxy?.qPct != null) return l.runoffProxy.qPct;
  if (opts?.allowEstimate) {
    const stor =
      typeof l.storagePct === "number" && Number.isFinite(l.storagePct)
        ? l.storagePct
        : l.q == null && l.qmax == null && typeof l.pct === "number"
          ? l.pct
          : null;
    return estRunoffFromStoragePct(stor);
  }
  return null;
}

/** หาสถานีจากชื่อ/รหัส (+ proxy) */
export function findLevelForRunoff(levels: (LevelLike & { runoffProxy?: RunoffProxy | null })[], name: string, code?: string | null) {
  return (code && levels.find((l) => l.code === code)) || levels.find((l) => l.name === name) || null;
}

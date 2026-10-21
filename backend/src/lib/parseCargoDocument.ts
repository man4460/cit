/** อ่านตารางรถสินค้าจากเอกสารตอบกลับขนส่ง (เช่น B&W) */

const PLATE_RE = /\d{2}\s*[-–—]\s*\d{4}/g;
const ID_RE = /(?<!\d)\d{13}(?!\d)/g;
const PHONE_RE = /0\d{2}\s*[-–]\s*\d{7}/g;
const PHONE_FALLBACK_RE = /(?<!\d)0\d{9}(?!\d)/g;
const NAME_TOKEN = "(?!(?:นางสาว|นาย|นาง))[ก-๙A-Za-z.]+";
const NAME_RE = new RegExp(`(?:นางสาว|นาย|นาง)\\s*${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){0,1}`, "g");
const TRUCK_START_RE = /(?:^|\n)\s*(\d{1,2})\s+(\d{2}\s*[-–—]\s*\d{4})\b/g;
const HEADER_NOISE_RE =
  /ลำดับ|ทะเบียนหัว|ทะเบียนหาง|ชื่อ-นามสกุล|ชื่อนามสกุล|เลขบัตรประชาชน|เบอร์โทร|หมายเหตุ|--\s*\d+\s+of\s+\d+\s*--/g;

export type ParsedCargoDriver = {
  name: string;
  idNumber: string;
  phone: string;
};

export type ParsedCargoTruck = {
  tractorPlate: string;
  trailerPlate: string;
  drivers: ParsedCargoDriver[];
  note: string;
  role: string;
};

export type CargoPlateVehicle = { id: string; licensePlate: string };

export const CARGO_DOC_IMPORT_REMARK = "จากเอกสารขนส่ง";

export type CargoDocumentPerson = {
  id: string;
  fullName: string;
  rank?: string | null;
  idNumber?: string | null;
  phone?: string | null;
  remarks?: string | null;
  categoryName?: string | null;
};

export function isCargoDocImportedRemarks(remarks?: string | null): boolean {
  return (remarks ?? "").includes(CARGO_DOC_IMPORT_REMARK);
}

export function cargoDriverRegistryName(name: string): string {
  return name.replace(/^(นางสาว|นาย|นาง)\s*/u, "").trim();
}

export function compactPlate(value: string): string {
  return value.replace(/[\s-–—]/g, "").toLowerCase();
}

export function formatCargoPlate(value: string): string {
  const m = value.replace(/\s+/g, "").match(/^(\d{2})[-–—]?(\d{4})$/);
  return m ? `${m[1]}-${m[2]}` : value.trim();
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatCargoPhone(value: string): string {
  const d = digitsOnly(value);
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return value.trim();
}

export function normalizeThaiPersonName(value: string): string {
  return value
    .replace(/^(นางสาว|นาย|นาง)\s*/u, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function matchVehicleByPlate(
  vehicles: CargoPlateVehicle[],
  plate: string,
): CargoPlateVehicle | undefined {
  const compact = compactPlate(plate);
  if (compact.length < 6) return undefined;
  const exact = vehicles.find((v) => compactPlate(v.licensePlate) === compact);
  if (exact) return exact;
  return vehicles.find((v) => {
    const vp = compactPlate(v.licensePlate);
    if (!vp.endsWith(compact) || vp.length <= compact.length) return false;
    const prefix = vp.slice(0, vp.length - compact.length);
    return prefix.length > 0 && !/^\d+$/.test(prefix);
  });
}

export function matchCargoDocumentPerson(
  people: CargoDocumentPerson[],
  hint: { name?: string | null; idNumber?: string | null; phone?: string | null },
): CargoDocumentPerson | undefined {
  const cargo = people.filter((p) => (p.categoryName ?? "").trim() === "ขับรถสินค้า");
  const rest = people.filter((p) => (p.categoryName ?? "").trim() !== "ขับรถสินค้า");
  const order = [...cargo, ...rest];
  const idn = digitsOnly(hint.idNumber ?? "");
  if (idn.length >= 12) {
    const hit = order.find((p) => digitsOnly(p.idNumber ?? "") === idn);
    if (hit) return hit;
  }
  const n = normalizeThaiPersonName(hint.name ?? "");
  if (n.length >= 4) {
    const hit = order.find((p) => normalizeThaiPersonName(p.fullName) === n);
    if (hit) return hit;
  }
  const ph = digitsOnly(hint.phone ?? "");
  if (ph.length >= 9) {
    const hit = order.find((p) => digitsOnly(p.phone ?? "") === ph);
    if (hit) return hit;
  }
  return undefined;
}

export function assignCargoDocumentRoles(trucks: ParsedCargoTruck[]): ParsedCargoTruck[] {
  let goods = 0;
  const spareCount = trucks.filter((t) => !t.trailerPlate.trim()).length;
  let spare = 0;
  return trucks.map((t) => {
    if (t.trailerPlate.trim()) {
      goods += 1;
      return { ...t, role: `สินค้า ${goods}` };
    }
    spare += 1;
    return { ...t, role: spareCount > 1 ? `หัวลากสำรอง ${spare}` : "หัวลากสำรอง" };
  });
}

function takeAll(re: RegExp, text: string): { matches: string[]; rest: string } {
  const matches: string[] = [];
  const rest = text.replace(new RegExp(re.source, "g"), (m) => {
    const v = m.replace(/\s+/g, " ").trim();
    if (v) matches.push(v);
    return " ";
  });
  return { matches, rest };
}

const BLOCK_HEADER_RE =
  /^\s*(\d{1,2})\s+(\d{2}\s*[-–—]\s*\d{4})(?:\s+(\d{2}\s*[-–—]\s*\d{4}))?(?=\s|$|นาย|นาง)/;

function parseTruckBlock(block: string): ParsedCargoTruck | null {
  const header = block.match(BLOCK_HEADER_RE);
  let tractorPlate = header ? formatCargoPlate(header[2]) : "";
  let trailerPlate = header?.[3] ? formatCargoPlate(header[3]) : "";
  const afterHeader = header ? block.slice(header[0].length) : block;
  const ids = takeAll(ID_RE, afterHeader);
  const hyphenPhones = takeAll(PHONE_RE, ids.rest);
  const plainPhones = takeAll(PHONE_FALLBACK_RE, hyphenPhones.rest);
  const phones = [...hyphenPhones.matches, ...plainPhones.matches].map(formatCargoPhone);
  const extraPlates = takeAll(PLATE_RE, plainPhones.rest);
  if (!tractorPlate) {
    tractorPlate = formatCargoPlate(extraPlates.matches[0] ?? "");
    trailerPlate = formatCargoPlate(extraPlates.matches[1] ?? "");
  } else if (!trailerPlate && extraPlates.matches[0]) {
    trailerPlate = formatCargoPlate(extraPlates.matches[0]);
  }
  if (!tractorPlate) return null;
  const names = takeAll(NAME_RE, extraPlates.rest);
  const noteBits: string[] = [];
  const drivers: ParsedCargoDriver[] = [];
  const n = Math.min(2, Math.max(names.matches.length, ids.matches.length, phones.length));
  for (let i = 0; i < n; i++) {
    let name = (names.matches[i] ?? "").replace(/\s+/g, " ").trim();
    if (/ผู้ควบคุม/.test(name)) {
      noteBits.push("ผู้ควบคุม");
      name = name.replace(/ผู้ควบคุม/g, "").replace(/\s+/g, " ").trim();
    }
    const idNumber = ids.matches[i] ?? "";
    const phone = phones[i] ?? "";
    if (!name && !idNumber && !phone) continue;
    drivers.push({ name, idNumber, phone });
  }
  const leftover = names.rest
    .replace(HEADER_NOISE_RE, " ")
    .replace(/\d+\s+of\s+\d+/gi, " ")
    .replace(/ผู้ควบคุม/g, () => {
      noteBits.push("ผู้ควบคุม");
      return " ";
    })
    .replace(/^\s*\d{1,2}\s*/, " ")
    .replace(/[()]/g, " ")
    .replace(/[-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-–—,.;:]+/, "")
    .trim();
  if (leftover) noteBits.push(leftover);
  return {
    tractorPlate,
    trailerPlate,
    drivers,
    note: [...new Set(noteBits)].join(" ").slice(0, 120),
    role: "",
  };
}

function splitTruckBlocks(text: string): string[] {
  const cleaned = text.replace(/\r/g, "").replace(/\u00a0/g, " ");
  const starts: number[] = [];
  const re = new RegExp(TRUCK_START_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) {
    starts.push(m[0].startsWith("\n") ? m.index + 1 : m.index);
  }
  if (!starts.length) return [];
  const blocks: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : cleaned.length;
    const block = cleaned.slice(starts[i], end).trim();
    if (block) blocks.push(block);
  }
  return blocks;
}

export function parseCargoDocumentText(text: string): ParsedCargoTruck[] {
  const raw = (text ?? "").replace(/\u00a0/g, " ").trim();
  if (!raw) return [];
  const trucks = splitTruckBlocks(raw)
    .map(parseTruckBlock)
    .filter((t): t is ParsedCargoTruck => Boolean(t?.tractorPlate));
  return assignCargoDocumentRoles(trucks);
}

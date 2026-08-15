import {

  formatBahtPlain,

  formatThaiMissionDateRange,

  isBotPersonnelCategory,

  type BotAllowancePerson,

} from "./botAllowancePrint";



export const POLICE_PERSONNEL_CATEGORY_NAMES = [
  "ทางหลวง",
  "กองปราบ",
  "ปฏิบัติการพิเศษ",
  "อรินทราช",
  "ตำรวจ",
] as const;



/** กลุ่มสถานีตำรวจภูธรท้องที่ต่างๆ ในแบบพิมพ์ */

export const LOCAL_POLICE_STATIONS_GROUP = "สถานีตำรวจภูธรท้องที่ต่างๆ";



const POLICE_RANK_RE =

  /^(พ\.?\s*ต\.?\s*(ต\.|ท\.|อ\.)?|ร\.?\s*ต\.?\s*(ต\.|ท\.|อ\.)?|ส\.?\s*ต\.?\s*(ต\.|ท\.|อ\.)?|ด\.?\s*ต\.?|ว่าที่)/i;

const POLICE_ROLE_RE = /ตร\.|ตำรวจ|police|ทางหลวง|กองปราบ|อรินทราช|ปฏิบัติการพิเศษ/i;

const DRIVER_ROLE_RE = /คนขับ|driver/i;



export type PoliceAllowancePerson = BotAllowancePerson & {

  policeStationId?: string | null;

  policeStationName?: string | null;

  policeStationVendorCode?: string | null;

};



export type MissionPoliceStationRow = {

  policeStationId: string;

  name: string;

  vendorCode?: string | null;

  amount: string;

  note?: string | null;

  sortOrder?: number;

};



export function isPolicePersonnelCategory(name: string | null | undefined): boolean {

  const n = (name ?? "").trim();

  if (!n) return false;

  return (

    (POLICE_PERSONNEL_CATEGORY_NAMES as readonly string[]).includes(n) ||

    /ตำรวจ|ทางหลวง|กองปราบ|อรินทราช|ปฏิบัติการพิเศษ/.test(n)

  );

}



export function isLocalPoliceStationName(name: string | null | undefined): boolean {

  const n = (name ?? "").trim();

  if (!n) return false;

  if (n === LOCAL_POLICE_STATIONS_GROUP) return true;

  return /สถานีตำรวจ/.test(n) || /^สภ\./.test(n);

}



/** บุคคลภายนอกในภารกิจ — ไม่รวมประเภท ธปท. และคนขับ */

export function filterPoliceAllowancePersonnel(list: PoliceAllowancePerson[]): PoliceAllowancePerson[] {

  return list.filter((p) => {

    if (isBotPersonnelCategory(p.personnelCategoryName)) return false;

    const role = (p.roleName ?? "").trim();

    if (DRIVER_ROLE_RE.test(role)) return false;



    if (isPolicePersonnelCategory(p.personnelCategoryName)) return true;

    if (POLICE_ROLE_RE.test(role)) return true;

    const rank = (p.rank ?? "").trim().replace(/\s+/g, "");

    if (rank && POLICE_RANK_RE.test(rank)) return true;

    if (p.policeStationName?.trim()) return true;

    return false;

  });

}



export function splitThaiFullName(fullName: string): { firstName: string; lastName: string } {

  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length <= 1) return { firstName: fullName.trim() || "—", lastName: "" };

  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };

}



/** จัดรูปแบบเลขบัตรประชาชน 13 หลัก */

export function formatThaiNationalId(raw: string | null | undefined): string {

  const digits = (raw ?? "").replace(/\D/g, "");

  if (digits.length !== 13) return (raw ?? "").trim() || "—";

  return `${digits[0]} ${digits.slice(1, 5)} ${digits.slice(5, 10)} ${digits.slice(10, 12)} ${digits[12]}`;

}



/** สังกัดแบบสั้นในคอลัมน์ — ให้พอดีบรรทัดเดียว */

export function shortPoliceAffiliation(raw: string | null | undefined): string {

  const n = (raw ?? "").trim();

  if (!n) return "";

  if (isLocalPoliceStationName(n)) return LOCAL_POLICE_STATIONS_GROUP;

  if (/ทางหลวง/.test(n)) return "ตำรวจทางหลวง";

  if (/ปราบปราม|กองปราบ/.test(n)) return "กองปราบปราม";

  if (/อรินทราช|ก่อการร้าย|ต่อต้านการก่อการร้าย|ปฏิบัติการพิเศษ/.test(n)) return "อรินทราช 26";

  return n;

}



export function canonicalPolicePrintGroupTitle(raw: string): string {

  const n = raw.replace(/\s+/g, " ").trim();

  if (!n) return "ไม่ระบุสังกัด";

  if (isLocalPoliceStationName(n)) return LOCAL_POLICE_STATIONS_GROUP;

  if (/ทางหลวง/.test(n)) return "กองบังคับการตำรวจทางหลวง";

  if (/ปราบปราม|กองปราบ/.test(n)) return "กองบังคับการปราบปราม";

  if (/อรินทราช|ก่อการร้าย|ต่อต้านการก่อการร้าย|ปฏิบัติการพิเศษ/.test(n)) {
    return "กองกำกับการต่อต้านการก่อการร้าย";
  }

  return n;

}



function groupSortKey(title: string): number {

  if (/ปราบปราม|กองปราบ/.test(title)) return 0;

  if (/ทางหลวง/.test(title)) return 1;

  if (/อรินทราช|ก่อการร้าย|ปฏิบัติการพิเศษ/.test(title)) return 2;

  if (title === LOCAL_POLICE_STATIONS_GROUP || isLocalPoliceStationName(title)) return 3;

  return 9;

}



export type PolicePrintGroup = {

  key: string;

  title: string;

  rows: Array<{

    key: string;

    rank: string;

    firstName: string;

    lastName: string;

    idDisplay: string;

    amount: number;

    affiliation: string;

    isEntity?: boolean;

  }>;

};



const GROUP_COLORS = ["#cfe8f7", "#f7d9b8", "#d9d4a8", "#dcc6e8", "#c8e6c9", "#f5c6cb"];



export function policeGroupColor(index: number): string {

  return GROUP_COLORS[index % GROUP_COLORS.length]!;

}



/**

 * จัดกลุ่มตามสังกัดหลัก — สถานีภูธรรวมไว้กลุ่ม «สถานีตำรวจภูธรท้องที่ต่างๆ»

 * แถวหน่วยงาน (มี Vendor + จำนวนเงิน) ใส่ท้ายกลุ่มนั้น

 */

export function buildPolicePrintGroups(

  personnel: PoliceAllowancePerson[],

  stations: MissionPoliceStationRow[] = [],

): PolicePrintGroup[] {

  const people = filterPoliceAllowancePersonnel(personnel);

  const map = new Map<string, PolicePrintGroup>();



  function ensureGroup(title: string): PolicePrintGroup {

    const key = title;

    let g = map.get(key);

    if (!g) {

      g = { key, title, rows: [] };

      map.set(key, g);

    }

    return g;

  }



  for (const p of people) {

    const stationRaw = p.policeStationName?.trim() || p.position?.trim() || "ไม่ระบุสังกัด";

    const title = canonicalPolicePrintGroupTitle(stationRaw);

    const g = ensureGroup(title);

    const { firstName, lastName } = splitThaiFullName(p.fullName);

    const affiliationSource = p.position?.trim() || stationRaw;

    g.rows.push({

      key: p.personnelId,

      rank: (p.rank ?? "").trim(),

      firstName,

      lastName,

      idDisplay: formatThaiNationalId(p.idNumber),

      amount: Number(p.compensationRate) || 0,

      affiliation: shortPoliceAffiliation(affiliationSource),

    });

  }



  for (const s of stations) {

    const amt = Number(s.amount);

    if (!Number.isFinite(amt) || amt <= 0) continue;

    const stationName = s.name.trim() || "สถานีตำรวจ";

    const title = canonicalPolicePrintGroupTitle(stationName);

    const g = ensureGroup(title);

    const isLocal = title === LOCAL_POLICE_STATIONS_GROUP;

    g.rows.push({

      key: `station-${s.policeStationId}`,

      rank: "",

      firstName: stationName,

      lastName: "",

      idDisplay: (s.vendorCode ?? "").trim() || "—",

      amount: amt,

      affiliation: isLocal ? LOCAL_POLICE_STATIONS_GROUP : shortPoliceAffiliation(stationName),

      isEntity: true,

    });

  }



  return [...map.values()]

    .filter((g) => g.rows.length > 0)

    .sort((a, b) => {

      const d = groupSortKey(a.title) - groupSortKey(b.title);

      if (d !== 0) return d;

      return a.title.localeCompare(b.title, "th");

    });

}



export function sumPolicePrintAmount(groups: PolicePrintGroup[]): number {

  return groups.reduce((sum, g) => sum + g.rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0), 0);

}



export { formatBahtPlain, formatThaiMissionDateRange };



import { prisma } from "./prisma.js";

const CATEGORY_NAME = "วิทยุสื่อสาร";

const DESC_HANDHELD_LEGACY = "เครื่องรับ-ส่งวิทยุ ชนิดใช้มือถือ";
const DESC_MOBILE = "เครื่องวิทยุคมนาคม ชนิดเคลื่อนที่ (Mobile Station)";
const DESC_MOBILE_COMPACT = "เครื่องวิทยุคมนาคมชนิดเคลื่อนที่(MobileStation)";
const DESC_HANDHELD = "เครื่องวิทยุคมนาคม ชนิดมือถือ (Handheld Station)";

type Row = { serial: string; itemName: string; costCenter: string; location: string; brand?: string };

function normalizeBrand(raw: string): string {
  const t = raw.trim();
  const lower = t.toLowerCase();
  if (lower === "hysera") return "Hytera";
  if (lower === "icom") return "Icom";
  if (lower === "kenwood") return "Kenwood";
  if (lower === "yaesu") return "Yaesu";
  if (lower === "drc") return "DRC";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const RADIO_ROWS: Row[] = [
  { serial: "1320000313", itemName: DESC_HANDHELD_LEGACY, costCenter: "103801", location: "อาคาร 1 ชั้น 1 โซน 1" },
  { serial: "1320000322", itemName: DESC_HANDHELD_LEGACY, costCenter: "103801", location: "นอกอาคาร สนง." },
  { serial: "1320000323", itemName: DESC_HANDHELD_LEGACY, costCenter: "103801", location: "อาคาร 1 ชั้น 1 โซน 1" },
  { serial: "1320000324", itemName: DESC_HANDHELD_LEGACY, costCenter: "103801", location: "อาคาร 1 ชั้น 1 โซน 1" },
  { serial: "1320000325", itemName: DESC_HANDHELD_LEGACY, costCenter: "103801", location: "อาคาร 1 ชั้น 1 โซน 1" },
  { serial: "1320000326", itemName: DESC_HANDHELD_LEGACY, costCenter: "103801", location: "นอกอาคาร สนง." },
  { serial: "1320000327", itemName: DESC_HANDHELD_LEGACY, costCenter: "103801", location: "นอกอาคาร สนง." },
  { serial: "1320000328", itemName: DESC_HANDHELD_LEGACY, costCenter: "103801", location: "นอกอาคาร สนง." },
  { serial: "1320000329", itemName: DESC_HANDHELD_LEGACY, costCenter: "103801", location: "นอกอาคาร สนง." },
  { serial: "1320000330", itemName: DESC_HANDHELD_LEGACY, costCenter: "103801", location: "อาคาร 1 ชั้น 1 โซน 1" },
  { serial: "1320000331", itemName: DESC_HANDHELD_LEGACY, costCenter: "103801", location: "อาคาร 1 ชั้น 1 โซน 1" },
  { serial: "1320000332", itemName: DESC_HANDHELD_LEGACY, costCenter: "103801", location: "อาคาร 1 ชั้น 1 โซน 1" },
  { serial: "1320000333", itemName: DESC_HANDHELD_LEGACY, costCenter: "103801", location: "อาคาร 1 ชั้น 1 โซน 1" },
  { serial: "1320000334", itemName: DESC_HANDHELD_LEGACY, costCenter: "103801", location: "อาคาร 1 ชั้น 1 โซน 1" },
  { serial: "1320000335", itemName: DESC_HANDHELD_LEGACY, costCenter: "103800", location: "อาคาร 1 ชั้น 1 โซน 1" },
  { serial: "1320000336", itemName: DESC_HANDHELD_LEGACY, costCenter: "103800", location: "อาคาร 1 ชั้น 1 โซน 1" },
  { serial: "1320000613", itemName: DESC_MOBILE, costCenter: "103801", location: "นอกอาคาร สนง.", brand: "Icom" },
  { serial: "1320000614", itemName: DESC_MOBILE, costCenter: "103801", location: "นอกอาคาร สนง.", brand: "Icom" },
  { serial: "1320000635", itemName: DESC_MOBILE_COMPACT, costCenter: "103801", location: "นอกอาคาร สนง.", brand: "hysera" },
  { serial: "1320000636", itemName: DESC_MOBILE_COMPACT, costCenter: "103801", location: "นอกอาคาร สนง.", brand: "hysera" },
  { serial: "1320001183", itemName: DESC_MOBILE, costCenter: "103801", location: "อาคาร 1 ชั้น 1 โซน 1", brand: "icom" },
  { serial: "1320001184", itemName: DESC_MOBILE, costCenter: "103801", location: "อาคาร 1 ชั้น 1 โซน 1", brand: "Icom" },
  { serial: "1320001185", itemName: DESC_MOBILE, costCenter: "103801", location: "อาคาร 1 ชั้น 1 โซน 1", brand: "Kenwood" },
  { serial: "1320002254", itemName: DESC_MOBILE, costCenter: "103801", location: "อาคาร 1 ชั้น 2 โซน 1", brand: "Yaesu" },
  { serial: "1320002255", itemName: DESC_MOBILE, costCenter: "103801", location: "อาคาร 1 ชั้น 2 โซน 1", brand: "Yaesu" },
  ...([
    "1320002905", "1320002906", "1320002907", "1320002908", "1320002909", "1320002910", "1320002911",
    "1320002912", "1320002913", "1320002914", "1320002915", "1320002916", "1320002917",
  ] as const).map((serial) => ({ serial, itemName: DESC_HANDHELD, costCenter: "103801", location: "อาคาร 1 ชั้น 1 โซน 1", brand: "DRC" })),
  { serial: "1320002918", itemName: DESC_HANDHELD, costCenter: "103801", location: "อาคาร 7 ชั้น 1", brand: "DRC" },
  { serial: "1320002919", itemName: DESC_HANDHELD, costCenter: "103801", location: "อาคาร 7 ชั้น 1", brand: "DRC" },
  { serial: "1320005189", itemName: DESC_MOBILE, costCenter: "103801", location: "นอกอาคาร สนง.", brand: "hysera" },
  { serial: "1320005190", itemName: DESC_MOBILE, costCenter: "103801", location: "นอกอาคาร สนง.", brand: "hysera" },
  { serial: "1320005191", itemName: DESC_MOBILE, costCenter: "103801", location: "นอกอาคาร สนง.", brand: "hysera" },
];

export async function seedRadioAssets(): Promise<void> {
  let category = await prisma.assetCategory.findUnique({ where: { name: CATEGORY_NAME } });
  if (!category) {
    const maxOrder = await prisma.assetCategory.aggregate({ _max: { sortOrder: true } });
    category = await prisma.assetCategory.create({
      data: { name: CATEGORY_NAME, sortOrder: (maxOrder._max.sortOrder ?? 0) + 1 },
    });
  }

  let upserted = 0;
  for (const row of RADIO_ROWS) {
    const serialNumber = row.serial.trim();
    const payload = {
      itemName: row.itemName,
      location: row.location,
      costCenter: row.costCenter.trim(),
      deviceBrand: row.brand?.trim() ? normalizeBrand(row.brand) : null,
      assetCategoryId: category.id,
    };
    const existing = await prisma.asset.findUnique({ where: { serialNumber } });
    if (existing) {
      await prisma.asset.update({ where: { serialNumber }, data: payload });
    } else {
      await prisma.asset.create({ data: { serialNumber, ...payload } });
    }
    upserted += 1;
  }
  console.log(`[seed] radios upserted: ${upserted}`);
}

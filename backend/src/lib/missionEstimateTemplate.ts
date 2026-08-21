/** โครงสร้างประมาณการตามชีต «ประมาณการค่าใช้จ่าย» (ขนส่งธนบัตร) */

export type EstimateLineKind = "GROUP" | "ITEM";

export type EstimateTemplateLine = {
  sortOrder: number;
  kind: EstimateLineKind;
  groupCode: string;
  itemCode: string | null;
  name: string;
  payoutMethod: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
  qtyEditable: boolean;
  rateEditable: boolean;
  amountEditable: boolean;
  includeInTotal: boolean;
  isReserve: boolean;
  expenseTypeName: string | null;
};

export type EstimateTemplate = {
  currentLabel: string;
  notes: string;
  lines: EstimateTemplateLine[];
};

export type EstimateLineInput = {
  kind: EstimateLineKind;
  groupCode?: string | null;
  itemCode?: string | null;
  name: string;
  payoutMethod?: string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  amount?: number | string | null;
  previousAmount?: number | string | null;
  qtyEditable?: boolean;
  rateEditable?: boolean;
  amountEditable?: boolean;
  includeInTotal?: boolean;
  isReserve?: boolean;
  expenseTypeName?: string | null;
  sortOrder?: number;
};

export type EstimateTotals = {
  spend: number;
  roundedSpend: number;
  reserveAmount: number;
  approvalTotal: number;
  previousSpend: number;
  previousReserve: number;
  previousApproval: number;
  groupSubtotals: { groupCode: string; current: number; previous: number }[];
};

function n(v: number | string | null | undefined): number {
  if (v == null || v === "") return 0;
  const x = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
}

function lineCurrentAmount(line: EstimateLineInput): number {
  const qty = line.quantity == null || line.quantity === "" ? NaN : n(line.quantity);
  const rate = line.unitPrice == null || line.unitPrice === "" ? NaN : n(line.unitPrice);
  if (line.qtyEditable && line.rateEditable && Number.isFinite(qty) && Number.isFinite(rate)) {
    return qty * rate;
  }
  return n(line.amount);
}

/** ปัดเป็นพันบาท (ROUND x, -3) ตามชีต */
export function roundToThousand(value: number): number {
  return Math.round(value / 1000) * 1000;
}

export function computeEstimateTotals(lines: EstimateLineInput[]): EstimateTotals {
  const byGroup = new Map<string, { current: number; previous: number }>();
  let spend = 0;
  let reserve = 0;
  let previousSpend = 0;
  let previousReserve = 0;

  for (const line of lines) {
    const groupCode = line.groupCode ?? "";
    if (!byGroup.has(groupCode)) byGroup.set(groupCode, { current: 0, previous: 0 });
    const g = byGroup.get(groupCode)!;
    const current = lineCurrentAmount(line);
    const previous = n(line.previousAmount);
    if (line.includeInTotal === false) continue;
    if (line.isReserve) {
      reserve += current;
      previousReserve += previous;
    } else {
      spend += current;
      previousSpend += previous;
      g.current += current;
      g.previous += previous;
    }
  }

  const roundedSpend = roundToThousand(spend);
  const previousRounded = roundToThousand(previousSpend);
  return {
    spend,
    roundedSpend,
    reserveAmount: reserve,
    approvalTotal: roundedSpend + reserve,
    previousSpend,
    previousReserve,
    previousApproval: previousRounded + previousReserve,
    groupSubtotals: [...byGroup.entries()].map(([groupCode, v]) => ({
      groupCode,
      current: v.current,
      previous: v.previous,
    })),
  };
}

function item(partial: Omit<EstimateTemplateLine, "kind" | "includeInTotal" | "isReserve"> & {
  isReserve?: boolean;
  includeInTotal?: boolean;
}): EstimateTemplateLine {
  const qtyEditable = partial.qtyEditable;
  const rateEditable = partial.rateEditable;
  const amount =
    qtyEditable && rateEditable && partial.quantity != null && partial.unitPrice != null
      ? partial.quantity * partial.unitPrice
      : partial.amount;
  return {
    ...partial,
    amount,
    kind: "ITEM",
    includeInTotal: partial.includeInTotal ?? true,
    isReserve: partial.isReserve ?? false,
  };
}

function groupHeader(partial: {
  sortOrder: number;
  groupCode: string;
  name: string;
  payoutMethod?: string | null;
  expenseTypeName?: string | null;
}): EstimateTemplateLine {
  return {
    sortOrder: partial.sortOrder,
    kind: "GROUP",
    groupCode: partial.groupCode,
    itemCode: null,
    name: partial.name,
    payoutMethod: partial.payoutMethod ?? null,
    quantity: null,
    unitPrice: null,
    amount: 0,
    qtyEditable: false,
    rateEditable: false,
    amountEditable: false,
    includeInTotal: false,
    isReserve: false,
    expenseTypeName: partial.expenseTypeName ?? null,
  };
}

function leafGroup(partial: {
  sortOrder: number;
  groupCode: string;
  name: string;
  amount: number;
  payoutMethod?: string | null;
  expenseTypeName?: string | null;
}): EstimateTemplateLine {
  return {
    sortOrder: partial.sortOrder,
    kind: "GROUP",
    groupCode: partial.groupCode,
    itemCode: null,
    name: partial.name,
    payoutMethod: partial.payoutMethod ?? null,
    quantity: null,
    unitPrice: null,
    amount: partial.amount,
    qtyEditable: false,
    rateEditable: false,
    amountEditable: true,
    includeInTotal: true,
    isReserve: false,
    expenseTypeName: partial.expenseTypeName ?? null,
  };
}

const ADVANCE = "ยืมเงินทดรองจ่าย";
const BILL = "บิลเรียกเก็บ";

/** ค่าเริ่มต้นจากชีตประมาณการ ศสร./ศหญ. 14–17 ก.ค. 69 */
export function defaultEstimateTemplate(): EstimateTemplate {
  const lines: EstimateTemplateLine[] = [
    groupHeader({
      sortOrder: 10,
      groupCode: "1",
      name: "ค่ารับรองขนย้ายทรัพย์สินมีค่า",
      payoutMethod: ADVANCE,
      expenseTypeName: "ค่ารับรอง",
    }),
    item({
      sortOrder: 11,
      groupCode: "1",
      itemCode: "1.1",
      name: "อาหารกลางวัน/เย็น (วัน Load)",
      payoutMethod: ADVANCE,
      quantity: 12,
      unitPrice: 240,
      amount: 2880,
      qtyEditable: true,
      rateEditable: true,
      amountEditable: false,
      expenseTypeName: "ค่ารับรอง",
    }),
    item({
      sortOrder: 12,
      groupCode: "1",
      itemCode: "1.2",
      name: "อาหารเช้า/ของว่าง/น้ำแข็ง (เดินทางไป-กลับ)",
      payoutMethod: ADVANCE,
      quantity: 39,
      unitPrice: 150,
      amount: 5850,
      qtyEditable: true,
      rateEditable: true,
      amountEditable: false,
      expenseTypeName: "ค่ารับรอง",
    }),
    item({
      sortOrder: 13,
      groupCode: "1",
      itemCode: "1.3",
      name: "เครื่องดื่ม (เดินทางไป-กลับ)",
      payoutMethod: ADVANCE,
      quantity: 39,
      unitPrice: 120,
      amount: 4680,
      qtyEditable: true,
      rateEditable: true,
      amountEditable: false,
      expenseTypeName: "ค่ารับรอง",
    }),
    item({
      sortOrder: 14,
      groupCode: "1",
      itemCode: "1.4",
      name: "อาหารกลางวัน (เดินทางไป)",
      payoutMethod: ADVANCE,
      quantity: 39,
      unitPrice: 120,
      amount: 4680,
      qtyEditable: true,
      rateEditable: true,
      amountEditable: false,
      expenseTypeName: "ค่ารับรอง",
    }),
    item({
      sortOrder: 15,
      groupCode: "1",
      itemCode: "1.5",
      name: "อาหารว่าง (ปลายทาง)",
      payoutMethod: ADVANCE,
      quantity: 39,
      unitPrice: 35,
      amount: 1365,
      qtyEditable: true,
      rateEditable: true,
      amountEditable: false,
      expenseTypeName: "ค่ารับรอง",
    }),
    item({
      sortOrder: 16,
      groupCode: "1",
      itemCode: "1.6",
      name: "อาหารเย็น จนท.ตร. (เดินทางไป) (ศหญ.)",
      payoutMethod: ADVANCE,
      quantity: 26,
      unitPrice: 120,
      amount: 3120,
      qtyEditable: true,
      rateEditable: true,
      amountEditable: false,
      expenseTypeName: "ค่ารับรอง",
    }),
    item({
      sortOrder: 17,
      groupCode: "1",
      itemCode: "1.7",
      name: "อาหารกลางวัน (เดินทางกลับ) (สพฐ.)",
      payoutMethod: ADVANCE,
      quantity: 27,
      unitPrice: 150,
      amount: 4050,
      qtyEditable: true,
      rateEditable: true,
      amountEditable: false,
      expenseTypeName: "ค่ารับรอง",
    }),
    item({
      sortOrder: 18,
      groupCode: "1",
      itemCode: "1.8",
      name: "อาหารเย็น จนท.ตร. (เดินทางกลับ) (สพฐ.)",
      payoutMethod: ADVANCE,
      quantity: 27,
      unitPrice: 150,
      amount: 4050,
      qtyEditable: true,
      rateEditable: true,
      amountEditable: false,
      expenseTypeName: "ค่ารับรอง",
    }),
    item({
      sortOrder: 19,
      groupCode: "1",
      itemCode: "1.9",
      name: "ที่พักจนท.ตร.ที่ร่วมภารกิจฯ (ศหญ.)",
      payoutMethod: ADVANCE,
      quantity: 0,
      unitPrice: 1400,
      amount: 0,
      qtyEditable: true,
      rateEditable: true,
      amountEditable: false,
      expenseTypeName: "ค่ารับรอง",
    }),
    groupHeader({
      sortOrder: 20,
      groupCode: "2",
      name: "ค่าตอบแทนบุคคลภายนอกอื่นๆ",
      payoutMethod: BILL,
      expenseTypeName: "ค่าตอบแทนบุคคลภายนอก",
    }),
    item({
      sortOrder: 21,
      groupCode: "2",
      itemCode: "2.1",
      name: "จนท.ตร.ปฏิบัติการพิเศษ (อรินทราช / หนุมาน)",
      payoutMethod: BILL,
      quantity: 0,
      unitPrice: 0,
      amount: 0,
      qtyEditable: true,
      rateEditable: true,
      amountEditable: false,
      expenseTypeName: "ค่าตอบแทนบุคคลภายนอก",
    }),
    item({
      sortOrder: 22,
      groupCode: "2",
      itemCode: "2.2",
      name: "จนท.ตร.ทางหลวง",
      payoutMethod: BILL,
      quantity: 0,
      unitPrice: 0,
      amount: 0,
      qtyEditable: true,
      rateEditable: true,
      amountEditable: false,
      expenseTypeName: "ค่าตอบแทนบุคคลภายนอก",
    }),
    item({
      sortOrder: 23,
      groupCode: "2",
      itemCode: "2.3",
      name: "จนท.ตร.กองปราบ",
      payoutMethod: BILL,
      quantity: 0,
      unitPrice: 0,
      amount: 0,
      qtyEditable: true,
      rateEditable: true,
      amountEditable: false,
      expenseTypeName: "ค่าตอบแทนบุคคลภายนอก",
    }),
    item({
      sortOrder: 24,
      groupCode: "2",
      itemCode: "2.4",
      name: "จนท.ตร.นำเข้าพื้นที่ 1 (ไม่เกิน 2,000 บาท)",
      payoutMethod: BILL,
      quantity: null,
      unitPrice: null,
      amount: 2000,
      qtyEditable: false,
      rateEditable: false,
      amountEditable: true,
      expenseTypeName: "ค่าตอบแทนบุคคลภายนอก",
    }),
    item({
      sortOrder: 25,
      groupCode: "2",
      itemCode: "2.5",
      name: "จนท.ตร.นำเข้าพื้นที่ 2 (ไม่เกิน 2,000 บาท)",
      payoutMethod: BILL,
      quantity: null,
      unitPrice: null,
      amount: 2000,
      qtyEditable: false,
      rateEditable: false,
      amountEditable: true,
      expenseTypeName: "ค่าตอบแทนบุคคลภายนอก",
    }),
    item({
      sortOrder: 26,
      groupCode: "2",
      itemCode: "2.6",
      name: "ค่าบริหารกำลังพลปฏิบัติการพิเศษ (เต็มอัตรา 2,000 บาท)",
      payoutMethod: BILL,
      quantity: null,
      unitPrice: null,
      amount: 2000,
      qtyEditable: false,
      rateEditable: false,
      amountEditable: true,
      expenseTypeName: "ค่าตอบแทนบุคคลภายนอก",
    }),
    item({
      sortOrder: 27,
      groupCode: "2",
      itemCode: "2.7",
      name: "ค่าพาหนะปฏิบัติการพิเศษ (เต็มอัตรา 3,000 บาท)",
      payoutMethod: BILL,
      quantity: null,
      unitPrice: null,
      amount: 3000,
      qtyEditable: false,
      rateEditable: false,
      amountEditable: true,
      expenseTypeName: "ค่าตอบแทนบุคคลภายนอก",
    }),
    leafGroup({
      sortOrder: 32,
      groupCode: "3",
      name: "ค่าธรรมเนียมอื่นๆ (ค่าทางด่วน)",
      amount: 0,
      payoutMethod: BILL,
      expenseTypeName: "ค่าธรรมเนียมอื่นๆ",
    }),
    leafGroup({
      sortOrder: 40,
      groupCode: "4",
      name: "ค่าใช้จ่ายเบ็ดเตล็ด (ค่าล้างรถ)",
      amount: 1060,
      payoutMethod: ADVANCE,
      expenseTypeName: "เบ็ดเตล็ด/ล้างรถ",
    }),
    groupHeader({
      sortOrder: 50,
      groupCode: "5",
      name: "เงินช่วยเหลือขนย้ายทรัพย์สินมีค่า",
      expenseTypeName: "ค่าที่พัก",
    }),
    item({
      sortOrder: 51,
      groupCode: "5",
      itemCode: "5.1",
      name: "ที่พัก จนท.ธปท.",
      payoutMethod: ADVANCE,
      quantity: 0,
      unitPrice: 1400,
      amount: 0,
      qtyEditable: true,
      rateEditable: true,
      amountEditable: false,
      expenseTypeName: "ค่าที่พัก",
    }),
    item({
      sortOrder: 52,
      groupCode: "5",
      itemCode: "5.2",
      name: "ค่ายานพาหนะ (ไป-กลับ)",
      payoutMethod: BILL,
      quantity: 0,
      unitPrice: 400,
      amount: 0,
      qtyEditable: true,
      rateEditable: true,
      amountEditable: false,
      expenseTypeName: "ค่าเงินช่วยเหลือ",
    }),
    item({
      sortOrder: 53,
      groupCode: "5",
      itemCode: "5.3",
      name: "เบี้ยเลี้ยง จนท.ธปท.",
      payoutMethod: BILL,
      quantity: null,
      unitPrice: null,
      amount: 15300,
      qtyEditable: false,
      rateEditable: false,
      amountEditable: true,
      expenseTypeName: "ค่าตอบแทน",
    }),
    leafGroup({
      sortOrder: 60,
      groupCode: "6",
      name: "ค่าน้ำมันเชื้อเพลิงฯ",
      amount: 41900,
      payoutMethod: ADVANCE,
      expenseTypeName: "ค่าน้ำมัน / เชื้อเพลิง",
    }),
    leafGroup({
      sortOrder: 70,
      groupCode: "7",
      name: "ค่าเบี้ยประกันภัย (ทำบิลเรียกเก็บ)",
      amount: 10992,
      payoutMethod: BILL,
      expenseTypeName: "ประกันภัย",
    }),
    leafGroup({
      sortOrder: 75,
      groupCode: "10",
      name: "รถบรรทุกสินค้า",
      amount: 0,
      payoutMethod: BILL,
      expenseTypeName: "ค่าจ้างรถบรรทุก",
    }),
    groupHeader({
      sortOrder: 80,
      groupCode: "8",
      name: "เงินช่วยเหลืออื่นๆ",
      payoutMethod: BILL,
      expenseTypeName: "ค่าเงินช่วยเหลือ",
    }),
    item({
      sortOrder: 81,
      groupCode: "8",
      itemCode: "8.1",
      name: "เบี้ยพิเศษสำหรับภารกิจขนส่ง",
      payoutMethod: BILL,
      quantity: null,
      unitPrice: null,
      amount: 46200,
      qtyEditable: false,
      rateEditable: false,
      amountEditable: true,
      expenseTypeName: "ค่าเงินช่วยเหลือ",
    }),
    item({
      sortOrder: 82,
      groupCode: "8",
      itemCode: "8.2",
      name: "เงินสำรองค่าใช้จ่าย",
      payoutMethod: BILL,
      quantity: null,
      unitPrice: null,
      amount: 10000,
      qtyEditable: false,
      rateEditable: false,
      amountEditable: true,
      isReserve: true,
      expenseTypeName: "ค่าเงินช่วยเหลือ",
    }),
  ];

  return {
    currentLabel: "สพฐ.-ศสร. / ศหญ.",
    notes: "",
    lines,
  };
}

export const ESTIMATE_EXPENSE_TYPE_NAMES = [
  "ค่ารับรอง",
  "ค่าตอบแทนบุคคลภายนอก",
  "ค่าธรรมเนียมอื่นๆ",
  "เบ็ดเตล็ด/ล้างรถ",
  "ค่าที่พัก",
  "ค่าเงินช่วยเหลือ",
  "ค่าตอบแทน",
  "ค่าน้ำมัน / เชื้อเพลิง",
  "ประกันภัย",
  "ค่าจ้างรถบรรทุก",
] as const;

export function lineKey(line: { kind: string; groupCode?: string | null; itemCode?: string | null }): string {
  if (line.itemCode) return line.itemCode;
  return `g:${line.groupCode ?? line.kind}`;
}

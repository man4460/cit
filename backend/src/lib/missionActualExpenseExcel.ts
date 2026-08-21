import XLSX from "xlsx-js-style";
import { computeEstimateTotals, type EstimateLineInput } from "./missionEstimateTemplate.js";

export type ActualExpenseExportPayload = {
  currentLabel?: string | null;
  currentDateRange?: string | null;
  notes?: string | null;
  currentTitle?: string | null;
  missionCode?: string | null;
  receivedAmount?: number | string | null;
  lines: EstimateLineInput[];
};

type CellStyle = XLSX.CellObject["s"];

const C = {
  headerBg: "F1F5F9",
  groupBg: "F8FAFC",
  missionBand: "EEF2FF",
  truckBand: "ECFDF5",
  returnBand: "E0F2FE",
  totalBg: "FFFFFF",
  notesBg: "FFFBEB",
  border: "E2E8F0",
  dark: "1E1B3A",
  blue: "0000BF",
  slate: "64748B",
  emerald: "047857",
  white: "FFFFFF",
};

const thinBorder = {
  top: { style: "thin", color: { rgb: C.border } },
  bottom: { style: "thin", color: { rgb: C.border } },
  left: { style: "thin", color: { rgb: C.border } },
  right: { style: "thin", color: { rgb: C.border } },
};

function num(v: number | string | null | undefined): number | "" {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : "";
}

function lineAmount(line: EstimateLineInput): number {
  // ค่าใช้จ่ายจริงใช้ยอด amount ตรง ๆ
  const amt = num(line.amount);
  return amt === "" ? 0 : Number(amt);
}

function isCargoTruckLine(line: EstimateLineInput): boolean {
  if (line.groupCode === "10") return true;
  return line.kind === "GROUP" && String(line.expenseTypeName ?? "").trim() === "ค่าจ้างรถบรรทุก";
}

function moneyStyle(extra?: Partial<CellStyle>): CellStyle {
  return {
    numFmt: "#,##0.00",
    alignment: { horizontal: "right", vertical: "center" },
    border: thinBorder,
    ...extra,
  };
}

function textStyle(extra?: Partial<CellStyle>): CellStyle {
  return {
    alignment: { vertical: "center", wrapText: true },
    border: thinBorder,
    ...extra,
  };
}

function setCell(
  ws: XLSX.WorkSheet,
  r: number,
  c: number,
  v: string | number,
  s?: CellStyle,
) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell: XLSX.CellObject = {
    v,
    t: typeof v === "number" ? "n" : "s",
    s,
  };
  ws[addr] = cell;
}

function merge(ws: XLSX.WorkSheet, r1: number, c1: number, r2: number, c2: number) {
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"].push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
}

function sumAdvance(lines: EstimateLineInput[]): number {
  let sum = 0;
  for (const line of lines) {
    if (line.includeInTotal === false || line.isReserve) continue;
    if (String(line.payoutMethod ?? "").trim() !== "ยืมเงินทดรองจ่าย") continue;
    sum += lineAmount(line);
  }
  return sum;
}

function writeSectionBand(ws: XLSX.WorkSheet, row: number, title: string, bg: string, accent: string) {
  merge(ws, row, 0, row, 4);
  setCell(ws, row, 0, title, {
    fill: { fgColor: { rgb: bg } },
    font: { bold: true, sz: 11, color: { rgb: accent } },
    border: thinBorder,
    alignment: { horizontal: "left", vertical: "center" },
  });
}

function writeLineTable(
  ws: XLSX.WorkSheet,
  startRow: number,
  lines: EstimateLineInput[],
): number {
  let row = startRow;
  const headers = ["ที่", "รายการ", "วิธีจ่าย", "ค่าใช้จ่ายจริง", "อ้างอิงประมาณการ", "ผลต่าง"];
  // 5 data cols used: ที่ รายการ วิธีจ่าย ค่าใช้จ่ายจริง อ้างอิง ผลต่าง — expand to 0..5
  for (let c = 0; c < headers.length; c++) {
    setCell(ws, row, c, headers[c]!, {
      fill: { fgColor: { rgb: C.headerBg } },
      font: { bold: true, sz: 10, color: { rgb: C.slate } },
      border: thinBorder,
      alignment: {
        horizontal: c >= 3 ? "right" : "left",
        vertical: "center",
        wrapText: true,
      },
    });
  }
  row++;

  for (const line of lines) {
    const isGroup = line.kind === "GROUP";
    const isItem = line.kind === "ITEM";
    const current = line.includeInTotal === false ? "" : lineAmount(line);
    const previousRaw = line.includeInTotal === false ? "" : num(line.previousAmount);
    const previous = previousRaw === "" ? "" : Number(previousRaw);
    const delta =
      typeof current === "number" && typeof previous === "number" ? current - previous : "";
    const rowFill = isGroup ? C.groupBg : C.white;

    setCell(ws, row, 0, line.itemCode || line.groupCode || "", {
      fill: { fgColor: { rgb: rowFill } },
      font: { sz: 10, color: { rgb: C.slate } },
      border: thinBorder,
      alignment: { horizontal: "left", vertical: "center" },
    });
    setCell(
      ws,
      row,
      1,
      line.name,
      textStyle({
        fill: { fgColor: { rgb: rowFill } },
        font: {
          bold: isGroup,
          color: { rgb: isGroup ? C.dark : "334155" },
          sz: isGroup ? 11 : 10,
        },
        alignment: {
          horizontal: "left",
          vertical: "center",
          wrapText: true,
          indent: isItem ? 1 : 0,
        },
      }),
    );
    setCell(ws, row, 2, line.payoutMethod || "", {
      fill: { fgColor: { rgb: rowFill } },
      font: { sz: 9, color: { rgb: C.slate } },
      border: thinBorder,
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
    });
    setCell(
      ws,
      row,
      3,
      current === "" ? "" : current,
      moneyStyle({
        fill: { fgColor: { rgb: rowFill } },
        font: { bold: !isGroup, sz: 10 },
      }),
    );
    setCell(
      ws,
      row,
      4,
      previous === "" ? "" : previous,
      moneyStyle({
        fill: { fgColor: { rgb: rowFill } },
        font: { sz: 10, color: { rgb: C.slate } },
      }),
    );
    setCell(
      ws,
      row,
      5,
      delta === "" ? "" : delta,
      moneyStyle({
        fill: { fgColor: { rgb: rowFill } },
        font: {
          sz: 10,
          bold: typeof delta === "number" && delta !== 0,
          color: {
            rgb:
              typeof delta === "number" && delta > 0
                ? "BE123C"
                : typeof delta === "number" && delta < 0
                  ? C.emerald
                  : C.slate,
          },
        },
      }),
    );
    row++;
  }
  return row;
}

function writeSubtotal(ws: XLSX.WorkSheet, row: number, label: string, amount: number, accent: string) {
  merge(ws, row, 0, row, 2);
  setCell(ws, row, 0, label, {
    fill: { fgColor: { rgb: C.totalBg } },
    font: { bold: true, color: { rgb: C.dark } },
    border: thinBorder,
    alignment: { horizontal: "left", vertical: "center" },
  });
  setCell(ws, row, 3, amount, {
    ...moneyStyle({
      fill: { fgColor: { rgb: C.totalBg } },
      font: { bold: true, sz: 12, color: { rgb: accent } },
    }),
  });
  setCell(ws, row, 4, "", { border: thinBorder, fill: { fgColor: { rgb: C.totalBg } } });
  setCell(ws, row, 5, "", { border: thinBorder, fill: { fgColor: { rgb: C.totalBg } } });
}

/** สร้างไฟล์ Excel ค่าใช้จ่ายจริง — แยกค่าใช้จ่ายภารกิจ / รถบรรทุก */
export function buildActualExpenseWorkbook(payload: ActualExpenseExportPayload): Buffer {
  const allLines = payload.lines ?? [];
  const missionLines = allLines.filter((l) => !isCargoTruckLine(l));
  const truckLines = allLines.filter((l) => isCargoTruckLine(l));
  const missionTotals = computeEstimateTotals(missionLines);
  const truckTotals = computeEstimateTotals(truckLines);
  const missionSpend = missionTotals.spend + missionTotals.reserveAmount;
  const truckSpend = truckTotals.spend;
  const grandTotal = missionSpend + truckSpend;

  const titleBits = [payload.missionCode, payload.currentTitle || "ค่าใช้จ่ายภารกิจ"].filter(Boolean);
  const title = titleBits.join(" · ");

  const ws: XLSX.WorkSheet = {};
  let row = 0;

  merge(ws, row, 0, row, 5);
  setCell(ws, row, 0, "รายงานค่าใช้จ่ายจริง", {
    font: { bold: true, sz: 16, color: { rgb: C.dark } },
    alignment: { horizontal: "left", vertical: "center" },
  });
  row++;

  merge(ws, row, 0, row, 5);
  setCell(ws, row, 0, title, {
    font: { bold: true, sz: 12, color: { rgb: C.blue } },
    alignment: { horizontal: "left", vertical: "center" },
  });
  row++;

  merge(ws, row, 0, row, 5);
  setCell(
    ws,
    row,
    0,
    [payload.currentLabel, payload.currentDateRange].filter(Boolean).join("  ·  ") || "—",
    {
      font: { sz: 10, color: { rgb: C.slate } },
      alignment: { horizontal: "left", vertical: "center" },
    },
  );
  row += 2;

  // —— ค่าใช้จ่ายภารกิจ ——
  writeSectionBand(ws, row, "1. ค่าใช้จ่ายภารกิจ", C.missionBand, C.blue);
  row++;
  row = writeLineTable(ws, row, missionLines);
  writeSubtotal(ws, row, "รวมค่าใช้จ่ายภารกิจ", missionSpend, C.dark);
  row += 2;

  // —— รถบรรทุก ——
  writeSectionBand(ws, row, "2. ค่าจ้างรถบรรทุกสินค้า", C.truckBand, C.emerald);
  row++;
  if (truckLines.length) {
    row = writeLineTable(ws, row, truckLines);
  } else {
    merge(ws, row, 0, row, 5);
    setCell(ws, row, 0, "ไม่มีรายการ", {
      font: { sz: 10, color: { rgb: C.slate }, italic: true },
      border: thinBorder,
      alignment: { horizontal: "left", vertical: "center" },
    });
    row++;
  }
  writeSubtotal(ws, row, "รวมค่าจ้างรถบรรทุกสินค้า", truckSpend, C.emerald);
  row += 2;

  // —— สรุปรวม ——
  writeSectionBand(ws, row, "สรุปยอดรวม", C.headerBg, C.dark);
  row++;
  const summaryRows: [string, number, string][] = [
    ["ค่าใช้จ่ายภารกิจ", missionSpend, C.dark],
    ["ค่าจ้างรถบรรทุกสินค้า", truckSpend, C.emerald],
    ["รวมค่าใช้จ่ายจริง", grandTotal, C.blue],
  ];
  for (const [label, value, accent] of summaryRows) {
    merge(ws, row, 0, row, 2);
    setCell(ws, row, 0, label, {
      fill: { fgColor: { rgb: C.totalBg } },
      font: { bold: true, color: { rgb: C.slate } },
      border: thinBorder,
      alignment: { horizontal: "left", vertical: "center" },
    });
    setCell(ws, row, 3, value, {
      ...moneyStyle({
        fill: { fgColor: { rgb: C.totalBg } },
        font: { bold: true, sz: label.includes("รวมค่าใช้จ่ายจริง") ? 13 : 11, color: { rgb: accent } },
      }),
    });
    setCell(ws, row, 4, "", { border: thinBorder });
    setCell(ws, row, 5, "", { border: thinBorder });
    row++;
  }

  const notes = String(payload.notes ?? "").trim();
  if (notes) {
    row++;
    merge(ws, row, 0, row, 5);
    setCell(ws, row, 0, "หมายเหตุ", {
      fill: { fgColor: { rgb: C.notesBg } },
      font: { bold: true, color: { rgb: "92400E" } },
      border: thinBorder,
      alignment: { horizontal: "left", vertical: "center" },
    });
    row++;
    for (const noteLine of notes.split(/\r?\n/)) {
      if (!noteLine.trim()) continue;
      merge(ws, row, 0, row, 5);
      setCell(ws, row, 0, noteLine, {
        fill: { fgColor: { rgb: C.notesBg } },
        font: { sz: 10, color: { rgb: "78350F" } },
        border: thinBorder,
        alignment: { horizontal: "left", vertical: "top", wrapText: true },
      });
      row++;
    }
  }

  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(row - 1, 0), c: 5 } });
  ws["!cols"] = [
    { wch: 8 },
    { wch: 42 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
  ];
  ws["!rows"] = [{ hpt: 24 }, { hpt: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ค่าใช้จ่ายจริง");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function isAdvanceLine(line: EstimateLineInput): boolean {
  if (line.includeInTotal === false || line.isReserve) return false;
  return String(line.payoutMethod ?? "").trim() === "ยืมเงินทดรองจ่าย";
}

/** Excel สรุปยอดส่งคืน — รายการยืมเงินทดรองจ่าย + ตารางสรุป */
export function buildAdvanceReturnWorkbook(payload: ActualExpenseExportPayload): Buffer {
  const allLines = payload.lines ?? [];
  const advanceLines = allLines.filter(isAdvanceLine);
  const advanceSpend = sumAdvance(allLines);
  const receivedRaw = num(payload.receivedAmount);
  const received = receivedRaw === "" ? 0 : Number(receivedRaw);
  const returnAmount = received - advanceSpend;

  const titleBits = [payload.missionCode, payload.currentTitle || "ค่าใช้จ่ายภารกิจ"].filter(Boolean);
  const title = titleBits.join(" · ");

  const ws: XLSX.WorkSheet = {};
  let row = 0;

  merge(ws, row, 0, row, 3);
  setCell(ws, row, 0, "สรุปยอดเงินส่งคืน", {
    font: { bold: true, sz: 16, color: { rgb: C.dark } },
    alignment: { horizontal: "left", vertical: "center" },
  });
  row++;

  merge(ws, row, 0, row, 3);
  setCell(ws, row, 0, title, {
    font: { bold: true, sz: 12, color: { rgb: C.blue } },
    alignment: { horizontal: "left", vertical: "center" },
  });
  row++;

  merge(ws, row, 0, row, 3);
  setCell(
    ws,
    row,
    0,
    [payload.currentLabel, payload.currentDateRange].filter(Boolean).join("  ·  ") || "—",
    {
      font: { sz: 10, color: { rgb: C.slate } },
      alignment: { horizontal: "left", vertical: "center" },
    },
  );
  row += 2;

  merge(ws, row, 0, row, 3);
  setCell(ws, row, 0, "รายการค่าใช้จ่ายที่ยืมเงินทดรองจ่าย", {
    fill: { fgColor: { rgb: "FEF3C7" } },
    font: { bold: true, sz: 11, color: { rgb: "92400E" } },
    border: thinBorder,
    alignment: { horizontal: "left", vertical: "center" },
  });
  row++;

  const headers = ["ลำดับ", "ที่", "รายการ", "จำนวนเงิน (บาท)"];
  for (let c = 0; c < headers.length; c++) {
    setCell(ws, row, c, headers[c]!, {
      fill: { fgColor: { rgb: C.headerBg } },
      font: { bold: true, sz: 10, color: { rgb: C.slate } },
      border: thinBorder,
      alignment: {
        horizontal: c === 3 ? "right" : "left",
        vertical: "center",
      },
    });
  }
  row++;

  if (!advanceLines.length) {
    merge(ws, row, 0, row, 3);
    setCell(ws, row, 0, "ไม่มีรายการยืมเงินทดรองจ่าย", {
      font: { sz: 10, color: { rgb: C.slate }, italic: true },
      border: thinBorder,
      alignment: { horizontal: "left", vertical: "center" },
    });
    row++;
  } else {
    let seq = 1;
    for (const line of advanceLines) {
      const isGroup = line.kind === "GROUP";
      const amount = lineAmount(line);
      const rowFill = isGroup ? C.groupBg : C.white;
      setCell(ws, row, 0, seq++, {
        fill: { fgColor: { rgb: rowFill } },
        font: { sz: 10, color: { rgb: C.slate } },
        border: thinBorder,
        alignment: { horizontal: "center", vertical: "center" },
      });
      setCell(ws, row, 1, line.itemCode || line.groupCode || "", {
        fill: { fgColor: { rgb: rowFill } },
        font: { sz: 10, color: { rgb: C.slate } },
        border: thinBorder,
        alignment: { horizontal: "left", vertical: "center" },
      });
      setCell(
        ws,
        row,
        2,
        line.name,
        textStyle({
          fill: { fgColor: { rgb: rowFill } },
          font: {
            bold: isGroup,
            color: { rgb: isGroup ? C.dark : "334155" },
            sz: isGroup ? 11 : 10,
          },
        }),
      );
      setCell(
        ws,
        row,
        3,
        amount,
        moneyStyle({
          fill: { fgColor: { rgb: rowFill } },
          font: { bold: true, sz: 10 },
        }),
      );
      row++;
    }
  }

  merge(ws, row, 0, row, 2);
  setCell(ws, row, 0, "รวมยืมเงินทดรองจ่าย", {
    fill: { fgColor: { rgb: "FEF3C7" } },
    font: { bold: true, color: { rgb: C.dark } },
    border: thinBorder,
    alignment: { horizontal: "left", vertical: "center" },
  });
  setCell(ws, row, 3, advanceSpend, {
    ...moneyStyle({
      fill: { fgColor: { rgb: "FEF3C7" } },
      font: { bold: true, sz: 12, color: { rgb: "92400E" } },
    }),
  });
  row += 2;

  merge(ws, row, 0, row, 3);
  setCell(ws, row, 0, "ตารางสรุปยอดเงินส่งคืน", {
    fill: { fgColor: { rgb: C.returnBand } },
    font: { bold: true, sz: 11, color: { rgb: "0369A1" } },
    border: thinBorder,
    alignment: { horizontal: "left", vertical: "center" },
  });
  row++;

  const returnHeaders = ["ลำดับ", "รายการ", "จำนวน / บาท"];
  for (let c = 0; c < returnHeaders.length; c++) {
    setCell(ws, row, c, returnHeaders[c]!, {
      fill: { fgColor: { rgb: "BAE6FD" } },
      font: { bold: true, sz: 10, color: { rgb: C.slate } },
      border: thinBorder,
      alignment: {
        horizontal: c === 2 ? "right" : "left",
        vertical: "center",
      },
    });
  }
  setCell(ws, row, 3, "", { border: thinBorder, fill: { fgColor: { rgb: "BAE6FD" } } });
  row++;

  const returnRows: [string, string, number, boolean][] = [
    ["1", "รับเงินจาก ฝธช.", received, false],
    ["2", "ค่าใช้จ่ายที่ยืมเงินทดรองจ่าย", advanceSpend, false],
    ["3", "คงเหลือส่งคืนทุกรายการ", returnAmount, true],
  ];
  for (const [seq, label, value, isFinal] of returnRows) {
    const bg = isFinal ? C.returnBand : C.white;
    setCell(ws, row, 0, seq, {
      fill: { fgColor: { rgb: bg } },
      font: { sz: 10, color: { rgb: C.slate } },
      border: thinBorder,
      alignment: { horizontal: "center", vertical: "center" },
    });
    merge(ws, row, 1, row, 2);
    setCell(ws, row, 1, label, {
      fill: { fgColor: { rgb: bg } },
      font: { bold: isFinal, color: { rgb: C.dark }, sz: isFinal ? 11 : 10 },
      border: thinBorder,
      alignment: { horizontal: "left", vertical: "center" },
    });
    setCell(ws, row, 3, value, {
      ...moneyStyle({
        fill: { fgColor: { rgb: bg } },
        font: { bold: true, sz: isFinal ? 13 : 11, color: { rgb: isFinal ? C.blue : C.dark } },
      }),
    });
    row++;
  }

  const notes = String(payload.notes ?? "").trim();
  if (notes) {
    row++;
    merge(ws, row, 0, row, 3);
    setCell(ws, row, 0, "หมายเหตุ", {
      fill: { fgColor: { rgb: C.notesBg } },
      font: { bold: true, color: { rgb: "92400E" } },
      border: thinBorder,
      alignment: { horizontal: "left", vertical: "center" },
    });
    row++;
    for (const noteLine of notes.split(/\r?\n/)) {
      if (!noteLine.trim()) continue;
      merge(ws, row, 0, row, 3);
      setCell(ws, row, 0, noteLine, {
        fill: { fgColor: { rgb: C.notesBg } },
        font: { sz: 10, color: { rgb: "78350F" } },
        border: thinBorder,
        alignment: { horizontal: "left", vertical: "top", wrapText: true },
      });
      row++;
    }
  }

  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(row - 1, 0), c: 3 } });
  ws["!cols"] = [{ wch: 8 }, { wch: 10 }, { wch: 42 }, { wch: 18 }];
  ws["!rows"] = [{ hpt: 24 }, { hpt: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "สรุปยอดส่งคืน");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

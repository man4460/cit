import XLSX from "xlsx-js-style";
import { withExcelFont } from "./excelFont.js";
import {
  computeEstimateTotals,
  type EstimateLineInput,
} from "./missionEstimateTemplate.js";

export type EstimateExportPayload = {
  currentLabel?: string | null;
  previousLabel?: string | null;
  currentDateRange?: string | null;
  previousDateRange?: string | null;
  notes?: string | null;
  previousTitle?: string | null;
  currentTitle?: string | null;
  lines: EstimateLineInput[];
};

type CellStyle = XLSX.CellObject["s"];

const C = {
  headerBg: "F8FAFC",
  groupBg: "FAF9FF",
  currentBg: "EEF2FF",
  previousBg: "F1F5F9",
  totalBg: "FFFFFF",
  notesBg: "FFFBEB",
  border: "E2E8F0",
  dark: "1E1B3A",
  blue: "0000BF",
  slate: "64748B",
  rose: "BE123C",
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
  const qty = num(line.quantity);
  const rate = num(line.unitPrice);
  if (line.qtyEditable && line.rateEditable && qty !== "" && rate !== "") return Number(qty) * Number(rate);
  const amt = num(line.amount);
  return amt === "" ? 0 : Number(amt);
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
  const style = s
    ? ({ ...s, font: withExcelFont(s.font as Parameters<typeof withExcelFont>[0]) } as CellStyle)
    : ({ font: withExcelFont(undefined) } as CellStyle);
  const cell: XLSX.CellObject = {
    v,
    t: typeof v === "number" ? "n" : "s",
    s: style,
  };
  ws[addr] = cell;
}

function merge(ws: XLSX.WorkSheet, r1: number, c1: number, r2: number, c2: number) {
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"].push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
}

export function buildEstimateWorkbook(payload: EstimateExportPayload): Buffer {
  const totals = computeEstimateTotals(payload.lines);
  const title = payload.currentTitle || "ประมาณการค่าใช้จ่ายภารกิจ";
  const ws: XLSX.WorkSheet = {};
  let row = 0;

  merge(ws, row, 0, row, 6);
  setCell(ws, row, 0, title, {
    font: { bold: true, sz: 14, color: { rgb: C.dark } },
    alignment: { horizontal: "left", vertical: "center" },
  });
  row++;

  merge(ws, row, 0, row, 6);
  setCell(ws, row, 0, "เทียบประมาณการครั้งนี้กับประมาณการก่อนหน้าในเส้นทางเดียวกัน", {
    font: { sz: 10, color: { rgb: C.slate } },
    alignment: { horizontal: "left", vertical: "center" },
  });
  row += 2;

  merge(ws, row, 0, row, 2);
  setCell(ws, row, 0, "ประมาณการก่อนหน้า", {
    fill: { fgColor: { rgb: C.previousBg } },
    font: { bold: true, sz: 9, color: { rgb: C.slate } },
    border: thinBorder,
    alignment: { horizontal: "left", vertical: "center" },
  });
  merge(ws, row, 3, row, 6);
  setCell(ws, row, 3, "ประมาณการครั้งนี้", {
    fill: { fgColor: { rgb: C.currentBg } },
    font: { bold: true, sz: 9, color: { rgb: C.blue } },
    border: thinBorder,
    alignment: { horizontal: "left", vertical: "center" },
  });
  row++;

  merge(ws, row, 0, row, 2);
  setCell(ws, row, 0, payload.previousLabel || payload.previousTitle || "—", {
    fill: { fgColor: { rgb: C.previousBg } },
    font: { bold: true, color: { rgb: C.dark } },
    border: thinBorder,
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
  });
  merge(ws, row, 3, row, 6);
  setCell(ws, row, 3, payload.currentLabel || payload.currentTitle || "—", {
    fill: { fgColor: { rgb: C.currentBg } },
    font: { bold: true, color: { rgb: C.dark } },
    border: thinBorder,
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
  });
  row++;

  merge(ws, row, 0, row, 2);
  setCell(ws, row, 0, payload.previousDateRange || "—", {
    fill: { fgColor: { rgb: C.previousBg } },
    font: { sz: 10, color: { rgb: C.slate } },
    border: thinBorder,
    alignment: { horizontal: "left", vertical: "center" },
  });
  merge(ws, row, 3, row, 6);
  setCell(ws, row, 3, payload.currentDateRange || "—", {
    fill: { fgColor: { rgb: C.currentBg } },
    font: { sz: 10, color: { rgb: C.slate } },
    border: thinBorder,
    alignment: { horizontal: "left", vertical: "center" },
  });
  row += 2;

  const headers = ["ที่", "รายการ", "จำนวนคน", "อัตรา (บาท)", "ประมาณการครั้งนี้", "ประมาณการก่อนหน้า", "ผลต่าง"];
  for (let c = 0; c < headers.length; c++) {
    setCell(ws, row, c, headers[c]!, {
      fill: { fgColor: { rgb: C.headerBg } },
      font: { bold: true, sz: 10, color: { rgb: C.slate } },
      border: thinBorder,
      alignment: {
        horizontal: c >= 2 ? "right" : "left",
        vertical: "center",
        wrapText: true,
      },
    });
  }
  const headerRow = row;
  row++;

  for (const line of payload.lines) {
    const isGroup = line.kind === "GROUP";
    const isItem = line.kind === "ITEM";
    const current = line.includeInTotal === false ? "" : lineAmount(line);
    const previousRaw = line.includeInTotal === false ? "" : num(line.previousAmount);
    const previous = previousRaw === "" ? "" : Number(previousRaw);
    const delta =
      typeof current === "number" && typeof previous === "number" ? current - previous : "";

    const rowFill = isGroup ? C.groupBg : C.white;
    const nameStyle = textStyle({
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
    });

    const code = line.itemCode || line.groupCode || "";
    setCell(ws, row, 0, code, {
      fill: { fgColor: { rgb: rowFill } },
      font: { sz: 10, color: { rgb: C.slate } },
      border: thinBorder,
      alignment: { horizontal: "left", vertical: "center" },
    });

    const nameText = line.payoutMethod ? `${line.name} (${line.payoutMethod})` : line.name;
    setCell(ws, row, 1, nameText, nameStyle);

    setCell(
      ws,
      row,
      2,
      num(line.quantity),
      moneyStyle({
        fill: { fgColor: { rgb: rowFill } },
        numFmt: "#,##0",
        font: { sz: 10 },
      }),
    );
    setCell(
      ws,
      row,
      3,
      num(line.unitPrice),
      moneyStyle({
        fill: { fgColor: { rgb: rowFill } },
        font: { sz: 10 },
      }),
    );
    setCell(
      ws,
      row,
      4,
      current === "" ? "" : current,
      moneyStyle({
        fill: { fgColor: { rgb: rowFill } },
        font: { bold: !isGroup, sz: 10 },
      }),
    );
    setCell(
      ws,
      row,
      5,
      previous === "" ? "" : previous,
      moneyStyle({
        fill: { fgColor: { rgb: rowFill } },
        font: { sz: 10, color: { rgb: C.slate } },
      }),
    );

    const deltaStyle = moneyStyle({
      fill: { fgColor: { rgb: rowFill } },
      font: {
        sz: 10,
        bold: typeof delta === "number" && delta !== 0,
        color: {
          rgb:
            typeof delta === "number" && delta > 0
              ? C.rose
              : typeof delta === "number" && delta < 0
                ? C.emerald
                : C.slate,
        },
      },
    });
    setCell(ws, row, 6, delta === "" ? "" : delta, deltaStyle);
    row++;
  }

  row++;
  const totalRows: [string, number | string, string][] = [
    ["ยอดใช้จ่าย (ปัดกลมพันบาท)", totals.roundedSpend, `ก่อนปัด ${totals.spend.toLocaleString("th-TH")}`],
    ["สำรองค่าใช้จ่าย", totals.reserveAmount, ""],
    [
      "รวมขออนุมัติครั้งนี้",
      totals.approvalTotal,
      `ประมาณการก่อนหน้า ${(totals.previousApproval).toLocaleString("th-TH")}`,
    ],
  ];
  for (const [label, value, hint] of totalRows) {
    merge(ws, row, 0, row, 2);
    setCell(ws, row, 0, label, {
      fill: { fgColor: { rgb: C.totalBg } },
      font: { bold: true, color: { rgb: C.slate } },
      border: thinBorder,
      alignment: { horizontal: "left", vertical: "center" },
    });
    setCell(ws, row, 3, typeof value === "number" ? value : value, {
      ...moneyStyle({
        fill: { fgColor: { rgb: C.totalBg } },
        font: {
          bold: true,
          sz: 12,
          color: { rgb: label.includes("รวมขออนุมัติ") ? C.blue : C.dark },
        },
      }),
    });
    merge(ws, row, 4, row, 6);
    setCell(ws, row, 4, hint, {
      fill: { fgColor: { rgb: C.totalBg } },
      font: { sz: 10, color: { rgb: C.slate } },
      border: thinBorder,
      alignment: { horizontal: "left", vertical: "center" },
    });
    row++;
  }

  const notes = String(payload.notes ?? "").trim();
  if (notes) {
    row++;
    merge(ws, row, 0, row, 6);
    setCell(ws, row, 0, "หมายเหตุ", {
      fill: { fgColor: { rgb: C.notesBg } },
      font: { bold: true, color: { rgb: "92400E" } },
      border: thinBorder,
      alignment: { horizontal: "left", vertical: "center" },
    });
    row++;
    for (const noteLine of notes.split(/\r?\n/)) {
      if (!noteLine.trim()) continue;
      merge(ws, row, 0, row, 6);
      setCell(ws, row, 0, noteLine, {
        fill: { fgColor: { rgb: C.notesBg } },
        font: { sz: 10, color: { rgb: "78350F" } },
        border: thinBorder,
        alignment: { horizontal: "left", vertical: "top", wrapText: true },
      });
      row++;
    }
  }

  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row - 1, c: 6 } });
  ws["!cols"] = [
    { wch: 8 },
    { wch: 48 },
    { wch: 10 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
  ];
  ws["!rows"] = [{ hpt: 22 }, { hpt: 16 }];
  if (headerRow >= 0) ws["!rows"][headerRow] = { hpt: 28 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ประมาณการค่าใช้จ่าย");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

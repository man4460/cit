/** ฟอนต์มาตรฐานเอกสารราชการไทย — ใช้กับ Excel ที่ระบบสร้าง */
export const EXCEL_FONT_NAME = "TH SarabunPSK";

export type ExcelFont = {
  name?: string;
  bold?: boolean;
  italic?: boolean;
  sz?: number;
  color?: { rgb: string };
};

/** บังคับชื่อฟอนต์ Sarabun PSK โดยคง style อื่นไว้ */
export function withExcelFont<T extends ExcelFont | undefined>(font: T): ExcelFont {
  return { ...(font ?? {}), name: EXCEL_FONT_NAME };
}

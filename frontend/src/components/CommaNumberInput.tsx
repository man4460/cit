import type { ChangeEvent, InputHTMLAttributes } from "react";
import { formatGroupedInput, stripGroupedInput } from "../lib/formatNumber";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (raw: string) => void;
  /** จำนวนทศนิยมสูงสุดตอนพิมพ์ (ไม่บังคับ) */
  maxFractionDigits?: number;
};

/** ช่องตัวเลขแสดงจุลภาค — ส่งค่าดิบ (ไม่มี ,) ออกทาง onChange */
export function CommaNumberInput({
  value,
  onChange,
  maxFractionDigits,
  className,
  ...rest
}: Props) {
  const display = value === "" ? "" : formatGroupedInput(value);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    let raw = stripGroupedInput(e.target.value);
    if (raw && !/^\d*\.?\d*$/.test(raw)) return;
    if (maxFractionDigits != null && raw.includes(".")) {
      const [a, b = ""] = raw.split(".");
      raw = `${a}.${b.slice(0, maxFractionDigits)}`;
    }
    onChange(raw);
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      className={className}
      value={display}
      onChange={handleChange}
    />
  );
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** ข้อความเพิ่มสำหรับการค้นหา (ไม่แสดง) */
  keywords?: string;
  /** รูปย่อหน้าป้าย (null = แสดงกรอบว่าง) — ไม่ส่ง = ไม่มีช่องรูป */
  imageUrl?: string | null;
};

function OptionThumb({ url, size }: { url: string | null | undefined; size: "sm" | "md" }) {
  const cls = size === "md" ? "h-8 w-12" : "h-5 w-7";
  const [broken, setBroken] = useState(false);
  return url && !broken ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className={`${cls} shrink-0 rounded object-cover`}
    />
  ) : (
    <span className={`${cls} shrink-0 rounded bg-slate-100`} aria-hidden />
  );
}

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  /** ป้ายเมื่อยังไม่เลือก */
  emptyLabel?: string;
  /** อนุญาตให้ค่าว่าง */
  allowEmpty?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  id?: string;
  "aria-label"?: string;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  emptyLabel = "— เลือก —",
  allowEmpty = true,
  placeholder = "พิมพ์เพื่อค้นหา…",
  className = "",
  inputClassName = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900",
  id,
  "aria-label": ariaLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.keywords ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, filterText]);

  const updateMenuPosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const below = r.bottom + gap;
    const spaceBelow = window.innerHeight - below - 8;
    const maxH = Math.min(240, Math.max(120, spaceBelow));
    setMenuPos({ top: below, left: r.left, width: r.width, maxH });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
  }, [open, updateMenuPosition, filterText]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  /** รีเซ็ตข้อความกรองเมื่อปิดเมนูหรือเปลี่ยนค่าจากฟอร์ม */
  useEffect(() => {
    if (!open) setFilterText("");
  }, [value, open]);

  const inputDisplay = open ? filterText : selected?.label ?? "";

  const menuPortal =
    open &&
    menuPos &&
    createPortal(
      <ul
        ref={menuRef}
        className="fixed z-[200] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl shadow-[#0000BF]/15"
        style={{
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
          maxHeight: menuPos.maxH,
        }}
        role="listbox"
      >
        {allowEmpty && (
          <li
            role="option"
            className="cursor-pointer px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              setOpen(false);
              setFilterText("");
            }}
          >
            {emptyLabel}
          </li>
        )}
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-sm text-slate-600">ไม่พบรายการ</li>
        ) : (
          filtered.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`cursor-pointer px-3 py-2 text-sm hover:bg-slate-100 ${
                o.value === value ? "bg-[#0000BF]/10 text-[#2e2a58] font-semibold" : "text-slate-700"
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
                setFilterText("");
              }}
            >
              {o.imageUrl !== undefined ? (
                <span className="flex items-center gap-2">
                  <OptionThumb url={o.imageUrl} size="md" />
                  <span className="truncate">{o.label}</span>
                </span>
              ) : (
                o.label
              )}
            </li>
          ))
        )}
      </ul>,
      document.body,
    );

  const showSelectedThumb = !open && selected?.imageUrl !== undefined && Boolean(selected);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {showSelectedThumb ? (
        <span className="pointer-events-none absolute inset-y-0 left-1.5 flex items-center">
          <OptionThumb url={selected?.imageUrl} size="sm" />
        </span>
      ) : null}
      <input
        ref={inputRef}
        id={id}
        type="text"
        autoComplete="off"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        role="combobox"
        className={`${inputClassName}${showSelectedThumb ? " !pl-10" : ""}`}
        placeholder={selected ? placeholder : emptyLabel}
        value={inputDisplay}
        onFocus={() => {
          setOpen(true);
          setFilterText("");
        }}
        onChange={(e) => {
          setFilterText(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {menuPortal}
    </div>
  );
}

/** แสดงยศนำหน้าชื่อ (สำหรับตัวเลือกบุคลากร) */
export function personnelSelectLabel(p: { fullName: string; rank?: string | null }): string {
  const rank = p.rank?.trim();
  const name = (p.fullName ?? "").trim();
  if (rank && name) return `${rank} ${name}`;
  return name || rank || "—";
}

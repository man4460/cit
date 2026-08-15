import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** ย่อขนาดอักษรให้พอดีความกว้าง — ไม่ขึ้นบรรทัดใหม่ */
export function FitSingleLine({
  children,
  className = "",
  maxPx,
  minPx = 8,
  title,
}: {
  children: ReactNode;
  className?: string;
  maxPx: number;
  minPx?: number;
  title?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [size, setSize] = useState(maxPx);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      let s = maxPx;
      el.style.fontSize = `${s}px`;
      while (s > minPx && el.scrollWidth > el.clientWidth + 0.5) {
        s -= 0.5;
        el.style.fontSize = `${s}px`;
      }
      setSize(s);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [children, maxPx, minPx]);

  return (
    <p
      ref={ref}
      title={title}
      className={`min-w-0 overflow-hidden whitespace-nowrap ${className}`.trim()}
      style={{ fontSize: size }}
    >
      {children}
    </p>
  );
}

type BrandLogoProps = {
  variant?: "horizontal" | "stacked";
  className?: string;
  /**
   * ปรับโทนสีให้เข้ากับ UI (อมเขียวมรกต/นวลขึ้นบนพื้นเข้ม)
   * ตั้ง false ถ้าต้องการสีจากไฟล์ PNG ตรง ๆ
   */
  themed?: boolean;
};

export function BrandLogo({ variant = "horizontal", className = "", themed = true }: BrandLogoProps) {
  const src = variant === "stacked" ? "/logo-stacked.png" : "/logo-horizontal.png";
  /** โทนเข้ากับ accent เขียวมรกต (#0d9488 / teal) บนพื้น slate เข้ม */
  const themedFilter = "brightness(1.08) saturate(0.82) hue-rotate(26deg) contrast(1.06)";

  return (
    <span className="inline-flex max-w-full select-none bg-transparent align-middle [isolation:isolate]">
      <img
        src={src}
        alt="ALL FOR ONE"
        decoding="async"
        draggable={false}
        className={["max-h-full w-auto object-contain !bg-transparent", className].filter(Boolean).join(" ")}
        style={{
          backgroundColor: "transparent",
          backgroundImage: "none",
          boxShadow: "none",
          ...(themed ? { filter: themedFilter } : {}),
        }}
      />
    </span>
  );
}

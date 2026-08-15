type BrandLogoProps = {
  variant?: "horizontal" | "stacked";
  className?: string;
  /**
   * ปรับโทนสีให้เข้ากับ UI แบรนด์น้ำเงิน–ม่วง (โทน Ai Cluster)
   * ตั้ง false ถ้าต้องการสีจากไฟล์ PNG ตรง ๆ
   */
  themed?: boolean;
};

export function BrandLogo({ variant = "horizontal", className = "", themed = true }: BrandLogoProps) {
  const src = variant === "stacked" ? "/logo-stacked.png" : "/logo-horizontal.png";
  /** โทนเข้ากับแบรนด์ #0000BF / violet บนพื้นอ่อน */
  const themedFilter = "brightness(1.02) saturate(1.05) hue-rotate(-8deg) contrast(1.04)";

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

/** โหมดติดตั้งเป็นแอป (Add to Home Screen / installed PWA) — แบบ Ai Cluster */
export function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** ใส่คลาสบน <html> เพื่อจัด layout เต็มจอ + safe-area */
export function applyPwaStandaloneClass(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (isStandaloneMode()) root.classList.add("pwa-standalone");
  else root.classList.remove("pwa-standalone");
}

/**
 * พิมพ์แบบฟอร์มด้วย HTML/CSS ในหน้าปัจจุบัน (เหมือนเบี้ยเลี้ยง ธปท.)
 * @page margin: 0 + padding ในเนื้อหา → หัว/ท้ายเบราว์เซอร์มักไม่โชว์
 */
export function printIsolatedElement(opts: {
  rootSelector: string;
  htmlClass: string;
  /** เช่น A4 landscape | A4 portrait */
  pageSize: string;
}): boolean {
  const source = document.querySelector(opts.rootSelector);
  if (!(source instanceof HTMLElement)) return false;

  const root = document.documentElement;
  const prevTitle = document.title;
  document.title = "\u00a0";

  const pageStyle = document.createElement("style");
  pageStyle.setAttribute("data-isolated-print", opts.htmlClass);
  // margin: 0 สำคัญ — ให้พื้นที่หัว/ท้ายของ Chrome ไม่โชว์วันที่/URL/เลขหน้า
  pageStyle.textContent = `
    @page {
      size: ${opts.pageSize};
      margin: 0;
    }
  `;
  document.head.appendChild(pageStyle);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.title = prevTitle;
    root.classList.remove(opts.htmlClass);
    pageStyle.remove();
    window.removeEventListener("afterprint", cleanup);
  };

  root.classList.add(opts.htmlClass);
  window.addEventListener("afterprint", cleanup);

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      try {
        window.print();
      } catch {
        cleanup();
        return;
      }
      window.setTimeout(cleanup, 1000);
    });
  });

  return true;
}

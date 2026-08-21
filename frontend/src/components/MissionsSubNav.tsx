import { NavLink, useLocation } from "react-router-dom";
import { itemMatchesPath, type NavItem } from "../lib/navConfig";
import { itemVisual, NavGlyph } from "../lib/navVisuals";
import { toolbarMasterGroupClass } from "../lib/uiTokens";

const SUB_ITEMS: NavItem[] = [
  { to: "/missions", label: "ภารกิจ" },
  { to: "/routes", label: "เส้นทางภารกิจ" },
];

/** เมนูย่อยภารกิจ — ใส่ใน PageHeaderBar extras ชิดขวาสุดแถวกรอง/พิมพ์ */
export function MissionsSubNav({ className = "" }: { className?: string }) {
  const { pathname } = useLocation();

  return (
    <nav aria-label="เมนูย่อยภารกิจ" className={`${toolbarMasterGroupClass} ${className}`.trim()}>
      {SUB_ITEMS.map((item) => {
        const active = itemMatchesPath(pathname, item);
        const visual = itemVisual(item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={`inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold transition sm:h-9 sm:px-3 sm:text-xs ${
              active
                ? "bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-white shadow-md"
                : "text-[#4d47b6] hover:bg-[#0000BF]/8"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <NavGlyph name={visual.icon} className={`h-3.5 w-3.5 shrink-0 ${active ? "text-white" : visual.tone}`} />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

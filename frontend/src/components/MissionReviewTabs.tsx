import { NavLink } from "react-router-dom";
import { brandGradientFillClass, toolbarMasterGroupClass } from "../lib/uiTokens";

const TABS = [
  { to: "/missions/overview", label: "สรุปเหตุการณ์ภารกิจทั้งหมด" },
  { to: "/missions/incidents", label: "เหตุการณ์ไม่ปกติระหว่างทริป" },
] as const;

/** แถบเมนูย่อยหน้า «สรุปเหตุการณ์» */
export function MissionReviewTabs() {
  return (
    <div className={toolbarMasterGroupClass}>
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          replace
          className={({ isActive }) =>
            `inline-flex h-7 items-center rounded-lg px-3 text-xs font-black transition ${
              isActive ? `${brandGradientFillClass} text-white shadow-md` : "text-[#4d47b6] hover:bg-[#0000BF]/8"
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}

import {
  PERMISSION_LEVEL_HINT,
  PERMISSION_LEVEL_LABEL,
  PERMISSION_LEVELS,
  PERMISSION_MODULES,
  fullPermissions,
  type PermissionLevel,
  type PermissionMap,
} from "../lib/permissions";

const LEVEL_ACTIVE: Record<PermissionLevel, string> = {
  none: "bg-slate-500 text-white",
  read: "bg-sky-600 text-white",
  edit: "bg-amber-500 text-white",
  delete: "bg-rose-600 text-white",
};

export function PermissionMatrix({ value, onChange }: { value: PermissionMap; onChange: (v: PermissionMap) => void }) {
  const groups = [...new Set(PERMISSION_MODULES.map((m) => m.group))];
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-2">
        <span className="mr-1 text-xs font-bold text-slate-600">ตั้งทุกส่วนเป็น</span>
        {PERMISSION_LEVELS.map((lv) => (
          <button
            key={lv}
            type="button"
            onClick={() => onChange(fullPermissions(lv))}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-bold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50"
          >
            {PERMISSION_LEVEL_LABEL[lv]}
          </button>
        ))}
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        <table className="w-full text-[12.5px]">
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g} group={g} value={value} onChange={onChange} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-3 py-1.5 text-[10.5px] leading-relaxed text-slate-500">
        {PERMISSION_LEVELS.map((lv) => `${PERMISSION_LEVEL_LABEL[lv]} = ${PERMISSION_LEVEL_HINT[lv]}`).join(" · ")}
      </p>
    </div>
  );
}

function GroupRows({ group, value, onChange }: { group: string; value: PermissionMap; onChange: (v: PermissionMap) => void }) {
  const mods = PERMISSION_MODULES.filter((m) => m.group === group);
  return (
    <>
      <tr className="bg-slate-50/80">
        <td colSpan={2} className="px-3 py-1 text-[10.5px] font-black uppercase tracking-wide text-slate-500">
          {group}
        </td>
      </tr>
      {mods.map((m) => {
        const cur = value[m.key] ?? "none";
        return (
          <tr key={m.key} className="border-t border-slate-100">
            <td className="px-3 py-1.5 font-semibold text-[#1e1b4b]">{m.label}</td>
            <td className="px-3 py-1.5 text-right">
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-200" role="radiogroup" aria-label={m.label}>
                {PERMISSION_LEVELS.map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    role="radio"
                    aria-checked={cur === lv}
                    title={PERMISSION_LEVEL_HINT[lv]}
                    onClick={() => onChange({ ...value, [m.key]: lv })}
                    className={`px-2.5 py-1 text-[11px] font-bold transition ${
                      cur === lv ? LEVEL_ACTIVE[lv] : "bg-white text-slate-500 hover:bg-slate-50"
                    } border-l border-slate-200 first:border-l-0`}
                  >
                    {PERMISSION_LEVEL_LABEL[lv]}
                  </button>
                ))}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

export function permissionSummary(role: string, permissions: PermissionMap | null): string {
  if (role === "ADMIN") return "ทุกส่วน (ผู้ดูแลระบบ)";
  if (permissions == null) return "ทุกส่วน · ลบได้";
  const counts = PERMISSION_LEVELS.map((lv) => ({
    lv,
    n: PERMISSION_MODULES.filter((m) => (permissions[m.key] ?? "none") === lv).length,
  }));
  return counts
    .filter((c) => c.n)
    .reverse()
    .map((c) => `${PERMISSION_LEVEL_LABEL[c.lv]} ${c.n}`)
    .join(" · ");
}

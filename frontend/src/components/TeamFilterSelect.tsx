export const UNSET_TEAM_LABEL = "ไม่ระบุทีม";

export function teamLabel(value: string | null | undefined): string {
  const t = value?.trim();
  return t ? t : UNSET_TEAM_LABEL;
}

export function uniqueTeamOptions(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const v of values) seen.add(teamLabel(v));
  return [...seen].sort((a, b) => {
    if (a === UNSET_TEAM_LABEL) return 1;
    if (b === UNSET_TEAM_LABEL) return -1;
    return a.localeCompare(b, "th");
  });
}

export function TeamFilterSelect({
  value,
  onChange,
  options,
  allLabel = "ทุกทีม",
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allLabel?: string;
}) {
  if (!options.length) return null;
  return (
    <label className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-xl border border-[#e8e6fc] bg-[#faf9ff]/90 px-2 shadow-sm sm:h-9 sm:px-2.5">
      <span className="hidden text-[11px] font-bold text-[#4d47b6] sm:inline sm:text-xs">ทีม</span>
      <select
        aria-label="กรองตามทีม"
        className="max-w-[9.5rem] cursor-pointer border-0 bg-transparent py-0.5 text-[11px] font-semibold text-[#2e2a58] outline-none sm:max-w-[12rem] sm:text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

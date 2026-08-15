import type { ReactNode } from "react";

type IconProps = { className?: string };

function Svg({ className = "h-5 w-5", children }: { className?: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
      {children}
    </svg>
  );
}

export const NavIcons = {
  overview: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1v-9" />
    </Svg>
  ),
  ops: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 17H3V7a2 2 0 012-2h7l2 3h5a2 2 0 012 2v7h-2" />
    </Svg>
  ),
  budget: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-2.2 0-4 1.12-4 2.5S9.8 13 12 13s4 1.12 4 2.5S14.2 18 12 18m0-12v1m0 10v1M4 6h16v12H4z" />
    </Svg>
  ),
  personnel: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1" />
      <circle cx="10" cy="8" r="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 20v-1a3.5 3.5 0 00-2.5-3.35M16.5 4.8a3 3 0 010 5.4" />
    </Svg>
  ),
  equipment: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    </Svg>
  ),
  materials: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </Svg>
  ),
  documents: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 11h8M8 15h5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h9l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" />
    </Svg>
  ),
  admin: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"
      />
    </Svg>
  ),
  cash: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v8m-3-5.5A2.5 2.5 0 0112 8a2.5 2.5 0 010 5 2.5 2.5 0 110 5 2.5 2.5 0 01-3-2.5" />
      <circle cx="12" cy="12" r="9" />
    </Svg>
  ),
  alert: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 4.3L2.8 18a2 2 0 001.7 3h15a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z" />
    </Svg>
  ),
  mission: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l2.4 7.2H22l-6 4.4 2.3 7.2L12 16.6 5.7 20.8 8 13.6 2 9.2h7.6L12 2z" />
    </Svg>
  ),
  calendar: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3m8-3v3M4 9h16M6 5h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" />
    </Svg>
  ),
  chart: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m0 14h16M8 17V10m5 7V7m5 10v-4" />
    </Svg>
  ),
  route: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7.5C10 10 14 14 16 16.5" />
    </Svg>
  ),
  year: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 12h5M7 3h10a2 2 0 012 2v14l-3-2-3 2-3-2-3 2V5a2 2 0 012-2z" />
    </Svg>
  ),
  link: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 007.07 0l2.12-2.12a5 5 0 00-7.07-7.07L10.5 5.43" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 11a5 5 0 00-7.07 0L4.81 13.12a5 5 0 107.07 7.07L13.5 18.57" />
    </Svg>
  ),
  users: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 21v-2a3.5 3.5 0 00-2.6-3.35M16.5 4.2a3 3 0 010 5.6" />
    </Svg>
  ),
  school: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l9 4.5-9 4.5L3 7.5 12 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10.5V16c0 .8 3.1 2.5 7 2.5s7-1.7 7-2.5v-5.5" />
    </Svg>
  ),
  car: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13l2-5a2 2 0 011.8-1.2h10.4A2 2 0 0119 8l2 5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 16a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm14 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM3 13h18v3H3z" />
    </Svg>
  ),
  shield: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" />
    </Svg>
  ),
  radio: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 9h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5l8 4M8 14h.01M12 14h4" />
    </Svg>
  ),
  gun: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h12l2-2h4v4h-3l-1 3H9l-1-3H3v-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12V9" />
    </Svg>
  ),
  fire: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2 3 5 4.5 5 8a5 5 0 11-10 0c0-2 1-3.5 2-4.5C10 8 11 9 12 3z" />
    </Svg>
  ),
  folder: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </Svg>
  ),
  user: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="8" r="3.5" />
    </Svg>
  ),
  activity: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 12h-4l-3 8L9 4l-3 8H2" />
    </Svg>
  ),
  qr: (p: IconProps) => (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 3h3v3h-3v-3zm3-3h3v2h-2v1h-1v-3zm-3 0h2v2h-2V14z" />
    </Svg>
  ),
  search: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 16.5L21 21" />
    </Svg>
  ),
} as const;

export type NavIconKey = keyof typeof NavIcons;

export type NavTone = {
  icon: NavIconKey;
  text: string;
  chip: string;
  ring: string;
  bar: string;
};

export const GROUP_TONES: Record<string, NavTone> = {
  overview: {
    icon: "overview",
    text: "text-[#0000BF]",
    chip: "bg-[#0000BF]/12 text-[#0000BF] ring-[#0000BF]/20",
    ring: "ring-[#0000BF]/25",
    bar: "from-[#0000BF] via-[#6366f1] to-[#8b5cf6]",
  },
  ops: {
    icon: "ops",
    text: "text-[#7c3aed]",
    chip: "bg-[#7c3aed]/12 text-[#7c3aed] ring-[#7c3aed]/20",
    ring: "ring-[#7c3aed]/25",
    bar: "from-[#7c3aed] via-[#a855f7] to-[#ec4899]",
  },
  budget: {
    icon: "budget",
    text: "text-emerald-700",
    chip: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25",
    ring: "ring-emerald-500/25",
    bar: "from-emerald-500 via-teal-500 to-cyan-500",
  },
  personnel: {
    icon: "personnel",
    text: "text-amber-700",
    chip: "bg-amber-500/15 text-amber-700 ring-amber-500/25",
    ring: "ring-amber-500/25",
    bar: "from-amber-500 via-orange-500 to-rose-400",
  },
  equipment: {
    icon: "equipment",
    text: "text-sky-700",
    chip: "bg-sky-500/12 text-sky-700 ring-sky-500/25",
    ring: "ring-sky-500/25",
    bar: "from-sky-500 via-blue-500 to-indigo-500",
  },
  materials: {
    icon: "materials",
    text: "text-rose-700",
    chip: "bg-rose-500/12 text-rose-700 ring-rose-500/25",
    ring: "ring-rose-500/25",
    bar: "from-rose-500 via-orange-500 to-amber-400",
  },
  documents: {
    icon: "documents",
    text: "text-indigo-700",
    chip: "bg-indigo-500/12 text-indigo-700 ring-indigo-500/25",
    ring: "ring-indigo-500/25",
    bar: "from-indigo-500 via-violet-500 to-fuchsia-500",
  },
  investigation: {
    icon: "search",
    text: "text-cyan-800",
    chip: "bg-cyan-500/12 text-cyan-800 ring-cyan-500/25",
    ring: "ring-cyan-500/25",
    bar: "from-cyan-600 via-sky-500 to-indigo-500",
  },
  admin: {
    icon: "admin",
    text: "text-slate-700",
    chip: "bg-slate-500/12 text-slate-700 ring-slate-500/25",
    ring: "ring-slate-500/25",
    bar: "from-slate-600 via-[#4d47b6] to-[#8b5cf6]",
  },
};

type ItemVisual = { icon: NavIconKey; tone: string; chip: string };

const ITEM_VISUALS: ({ match: RegExp } & ItemVisual)[] = [
  { match: /^\/$/, icon: "cash", tone: "text-[#0000BF]", chip: "bg-[#0000BF]/12 text-[#0000BF] ring-[#0000BF]/20" },
  {
    match: /security-incidents\/dashboard/,
    icon: "alert",
    tone: "text-rose-600",
    chip: "bg-rose-500/12 text-rose-600 ring-rose-500/25",
  },
  {
    match: /budget\/overview/,
    icon: "budget",
    tone: "text-emerald-600",
    chip: "bg-emerald-500/12 text-emerald-600 ring-emerald-500/25",
  },
  { match: /^\/missions/, icon: "mission", tone: "text-violet-600", chip: "bg-violet-500/12 text-violet-600 ring-violet-500/25" },
  { match: /^\/routes/, icon: "route", tone: "text-fuchsia-600", chip: "bg-fuchsia-500/12 text-fuchsia-600 ring-fuchsia-500/25" },
  { match: /^\/activities/, icon: "calendar", tone: "text-pink-600", chip: "bg-pink-500/12 text-pink-600 ring-pink-500/25" },
  { match: /^\/reports/, icon: "chart", tone: "text-indigo-600", chip: "bg-indigo-500/12 text-indigo-600 ring-indigo-500/25" },
  { match: /weekly-inspection/, icon: "car", tone: "text-sky-600", chip: "bg-sky-500/12 text-sky-600 ring-sky-500/25" },
  { match: /armor-monthly/, icon: "shield", tone: "text-teal-600", chip: "bg-teal-500/12 text-teal-600 ring-teal-500/25" },
  { match: /^\/security-incidents/, icon: "alert", tone: "text-rose-600", chip: "bg-rose-500/12 text-rose-600 ring-rose-500/25" },
  {
    match: /budget\/year\/\d+/,
    icon: "year",
    tone: "text-emerald-600",
    chip: "bg-emerald-500/12 text-emerald-600 ring-emerald-500/25",
  },
  { match: /budget\/commitment/, icon: "link", tone: "text-cyan-700", chip: "bg-cyan-500/12 text-cyan-700 ring-cyan-500/25" },
  { match: /^\/personnel/, icon: "users", tone: "text-amber-600", chip: "bg-amber-500/15 text-amber-700 ring-amber-500/25" },
  { match: /^\/training/, icon: "school", tone: "text-orange-600", chip: "bg-orange-500/12 text-orange-600 ring-orange-500/25" },
  { match: /^\/vehicles/, icon: "car", tone: "text-sky-600", chip: "bg-sky-500/12 text-sky-600 ring-sky-500/25" },
  { match: /^\/vests/, icon: "shield", tone: "text-teal-600", chip: "bg-teal-500/12 text-teal-600 ring-teal-500/25" },
  { match: /^\/radios/, icon: "radio", tone: "text-blue-600", chip: "bg-blue-500/12 text-blue-600 ring-blue-500/25" },
  { match: /^\/weapons/, icon: "gun", tone: "text-slate-700", chip: "bg-slate-500/12 text-slate-700 ring-slate-500/25" },
  { match: /fire-safety/, icon: "fire", tone: "text-rose-600", chip: "bg-rose-500/12 text-rose-600 ring-rose-500/25" },
  { match: /^\/documents/, icon: "folder", tone: "text-indigo-600", chip: "bg-indigo-500/12 text-indigo-600 ring-indigo-500/25" },
  {
    match: /^\/investigation\/cases/,
    icon: "folder",
    tone: "text-cyan-700",
    chip: "bg-cyan-500/12 text-cyan-700 ring-cyan-500/25",
  },
  {
    match: /^\/investigation\/approvals/,
    icon: "shield",
    tone: "text-amber-700",
    chip: "bg-amber-500/12 text-amber-700 ring-amber-500/25",
  },
  {
    match: /^\/investigation\/teams/,
    icon: "users",
    tone: "text-cyan-700",
    chip: "bg-cyan-500/12 text-cyan-700 ring-cyan-500/25",
  },
  {
    match: /^\/investigation/,
    icon: "search",
    tone: "text-cyan-700",
    chip: "bg-cyan-500/12 text-cyan-700 ring-cyan-500/25",
  },
  { match: /^\/admin/, icon: "user", tone: "text-[#4d47b6]", chip: "bg-[#4d47b6]/12 text-[#4d47b6] ring-[#4d47b6]/25" },
  {
    match: /audit-trail/,
    icon: "activity",
    tone: "text-fuchsia-600",
    chip: "bg-fuchsia-500/12 text-fuchsia-600 ring-fuchsia-500/25",
  },
  { match: /^\/scan/, icon: "qr", tone: "text-violet-600", chip: "bg-violet-500/12 text-violet-600 ring-violet-500/25" },
  { match: /^\/profile/, icon: "user", tone: "text-[#0000BF]", chip: "bg-[#0000BF]/12 text-[#0000BF] ring-[#0000BF]/20" },
];

const DEFAULT_ITEM: ItemVisual = {
  icon: "overview",
  tone: "text-[#4d47b6]",
  chip: "bg-[#4d47b6]/12 text-[#4d47b6] ring-[#4d47b6]/25",
};

export function groupTone(groupId: string): NavTone {
  return GROUP_TONES[groupId] ?? GROUP_TONES.overview;
}

export function itemVisual(to: string): ItemVisual {
  for (const row of ITEM_VISUALS) {
    if (row.match.test(to)) return { icon: row.icon, tone: row.tone, chip: row.chip };
  }
  return DEFAULT_ITEM;
}

export function NavGlyph({ name, className = "h-4 w-4" }: { name: NavIconKey; className?: string }) {
  const Icon = NavIcons[name];
  return <Icon className={className} />;
}

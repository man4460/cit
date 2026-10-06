import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { apiFormJson, apiJson } from "../api/client";
import { CommaNumberInput } from "../components/CommaNumberInput";
import { DetailField } from "../components/DetailField";
import { ImageLightbox } from "../components/ImageLightbox";
import { Modal, ModalFormActions, ModalFormBody } from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { PageHeaderBar } from "../components/PageHeaderBar";
import { PrintA4Table } from "../components/PrintA4Table";
import { rowMatchesFilter } from "../lib/searchNormalize";
import { prepareFilesForUpload } from "../lib/prepareImageFileForUpload";
import { CrudNameMasterModal } from "../components/CrudNameMasterModal";
import {
  listCardAccentClass,
  listCardClass,
  toolbarMasterBtnClass,
  toolbarMasterGroupClass,
  toolbarPrimaryBtnClass,
} from "../lib/uiTokens";

type WorkTaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

type WorkTaskPhoto = {
  id: string;
  workTaskId: string;
  fileUrl: string;
  mimeType: string;
  originalName: string | null;
  isCover: boolean;
  sortOrder: number;
  createdAt: string;
};

type WorkTaskExpense = {
  id: string;
  category: string | null;
  item: string;
  quantity: string | number;
  unitPrice: string | number;
  amount: string | number;
  note: string | null;
};

type WorkTaskAttachment = {
  id: string;
  fileUrl: string;
  mimeType: string;
  originalName: string | null;
  fileSize: number | null;
  createdAt: string;
};

type PersonOption = {
  id: string;
  fullName: string;
  rank: string | null;
  position: string | null;
  photoUrl: string | null;
  employeeCode?: string | null;
};

type WorkTaskParticipant = {
  id: string;
  personnelId: string | null;
  name: string;
  affiliation: string | null;
  personnel: PersonOption | null;
};

type ParticipantDraft = { key: string; personnelId: string | null; name: string; affiliation: string; photoUrl: string | null; position: string | null };

type Activity = {
  id: string;
  title: string;
  notionUrl: string | null;
  youtubeUrl: string | null;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  recordedBy: string | null;
  status: WorkTaskStatus;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  budgetAmount: string | number | null;
  sortOrder: number;
  createdAt: string;
  photos: WorkTaskPhoto[];
  expenses: WorkTaskExpense[];
  attachments: WorkTaskAttachment[];
  participants: WorkTaskParticipant[];
};

type ExpenseDraft = {
  key: string;
  category: string;
  item: string;
  quantity: string;
  unitPrice: string;
  note: string;
};

const statuses: WorkTaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];

const statusLabel: Record<WorkTaskStatus, string> = {
  TODO: "รอดำเนินการ",
  IN_PROGRESS: "กำลังทำ",
  DONE: "เสร็จแล้ว",
};

const activityStatusChip: Record<WorkTaskStatus, string> = {
  TODO: "bg-amber-500/15 text-amber-800",
  IN_PROGRESS: "bg-[#0000BF]/12 text-[#4d47b6]",
  DONE: "bg-emerald-500/15 text-emerald-700",
};

const EXPENSE_CATEGORIES: { name: string; color: string }[] = [
  { name: "ค่าอาหาร / อาหารว่าง", color: "#f97316" },
  { name: "ค่าเดินทาง / น้ำมัน", color: "#0ea5e9" },
  { name: "ค่าที่พัก", color: "#8b5cf6" },
  { name: "ค่าวัสดุอุปกรณ์", color: "#10b981" },
  { name: "ค่าเช่าสถานที่ / อุปกรณ์", color: "#ec4899" },
  { name: "ค่าตอบแทน / วิทยากร", color: "#eab308" },
  { name: "อื่น ๆ", color: "#64748b" },
];

type ActivityCategory = { id: string; name: string; sortOrder: number };

const ACTIVITY_CATEGORY_COLORS = ["#4d47b6", "#ef4444", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316"];

const categoryColor = (name: string | null | undefined) =>
  EXPENSE_CATEGORIES.find((c) => c.name === name)?.color ?? "#64748b";

const DOC_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*";

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20";
const labelClass = "text-xs font-semibold text-slate-600";

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function baht(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileKind(name: string | null | undefined, mime?: string | null) {
  const n = (name ?? "").toLowerCase();
  const m = (mime ?? "").toLowerCase();
  if (m.includes("pdf") || n.endsWith(".pdf")) return { label: "PDF", cls: "bg-rose-100 text-rose-700" };
  if (m.includes("word") || /\.docx?$/.test(n)) return { label: "DOC", cls: "bg-blue-100 text-blue-700" };
  if (m.includes("sheet") || m.includes("excel") || /\.xlsx?$/.test(n)) return { label: "XLS", cls: "bg-emerald-100 text-emerald-700" };
  if (m.includes("presentation") || m.includes("powerpoint") || /\.pptx?$/.test(n))
    return { label: "PPT", cls: "bg-orange-100 text-orange-700" };
  if (m.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic)$/.test(n)) return { label: "IMG", cls: "bg-violet-100 text-violet-700" };
  return { label: "FILE", cls: "bg-slate-100 text-slate-600" };
}

function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  if (host !== "youtube.com" && host !== "youtu.be") return null;
  const id =
    host === "youtu.be" ? u.pathname.split("/")[1] : u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)?.[1];
  return id && /^[\w-]{6,20}$/.test(id) ? id : null;
}

const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

function coverPhoto(a: Activity): WorkTaskPhoto | null {
  return a.photos.find((p) => p.isCover) ?? a.photos[0] ?? null;
}

let draftSeq = 0;
const newDraft = (category = ""): ExpenseDraft => ({
  key: `d${++draftSeq}`,
  category,
  item: "",
  quantity: "1",
  unitPrice: "",
  note: "",
});

const ICON_PATHS = {
  info: "M12 8h.01M11 12h1v4h1m-1-13a9 9 0 110 18 9 9 0 010-18z",
  clock: "M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z",
  pin: "M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11zm0-8.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21a8 8 0 0116 0",
  wallet: "M3 7h15a3 3 0 013 3v7a3 3 0 01-3 3H6a3 3 0 01-3-3V7zm0 0V6a2 2 0 012-2h11M16 13.5h2",
  clip: "M15.5 7.5l-6.8 6.8a2 2 0 102.8 2.8l7.1-7.1a4 4 0 10-5.7-5.7l-7.4 7.4a6 6 0 108.5 8.5L20 14",
  photo: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15.5 9.5a1 1 0 100-2 1 1 0 000 2z",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  plus: "M12 5v14M5 12h14",
  trash: "M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3",
  upload: "M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3",
  download: "M12 4v12m0 0l-4-4m4 4l4-4M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  video: "M3 6h12v12H3zM15 10l6-3v10l-6-3",
  tag: "M3 12V4h8l9 9-8 8-9-9zM7.5 8.5a1 1 0 100-2 1 1 0 000 2z",
  users: "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M16 3.5a4 4 0 010 7.5M18 14a6 6 0 014 7",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4",
  x: "M6 6l12 12M18 6L6 18",
  star: "M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z",
} as const;

function PlayBadge({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <span className={`flex items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-black/30 ring-4 ring-white/30 ${className}`}>
      <svg viewBox="0 0 24 24" className="ml-0.5 h-1/2 w-1/2" fill="currentColor" aria-hidden>
        <path d="M8 5.5v13l11-6.5z" />
      </svg>
    </span>
  );
}

function PersonAvatar({
  name,
  photoUrl,
  external,
  small,
}: {
  name: string;
  photoUrl?: string | null;
  external?: boolean;
  small?: boolean;
}) {
  const initial = name.replace(/^(นางสาว|นาย|นาง|น\.ส\.|ร\.ต\.[ตอท]\.|[ดพจส]\.[ตอท]\.)\s*/, "").trim().charAt(0) || "?";
  const size = small ? "h-5 w-5 text-[9px] ring-1" : "h-8 w-8 text-xs ring-2";
  return photoUrl ? (
    <img src={photoUrl} alt="" className={`${size} shrink-0 rounded-full object-cover ring-white`} />
  ) : (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-full font-black text-white ring-white ${
        external ? "bg-gradient-to-br from-slate-400 to-slate-500" : "bg-gradient-to-br from-violet-500 to-purple-400"
      }`}
    >
      {initial}
    </span>
  );
}

function ParticipantPicker({
  people,
  value,
  onChange,
}: {
  people: PersonOption[];
  value: ParticipantDraft[];
  onChange: (next: ParticipantDraft[]) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const picked = useMemo(() => new Set(value.map((v) => v.personnelId).filter(Boolean)), [value]);
  const term = q.trim();
  const matches = useMemo(
    () =>
      term
        ? people
            .filter((p) => !picked.has(p.id) && rowMatchesFilter(term, [p.fullName, p.rank, p.position, p.employeeCode]))
            .slice(0, 8)
        : [],
    [people, picked, term],
  );
  const exactExists = value.some((v) => v.name.replace(/\s+/g, " ").toLowerCase() === term.replace(/\s+/g, " ").toLowerCase());

  function addPerson(p: PersonOption) {
    onChange([
      ...value,
      {
        key: `p${++draftSeq}`,
        personnelId: p.id,
        name: [p.rank, p.fullName].filter(Boolean).join(" "),
        affiliation: "",
        photoUrl: p.photoUrl,
        position: p.position,
      },
    ]);
    setQ("");
  }

  function addExternal() {
    if (!term || exactExists) return;
    onChange([...value, { key: `p${++draftSeq}`, personnelId: null, name: term, affiliation: "", photoUrl: null, position: null }]);
    setQ("");
  }

  return (
    <div>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-400" />
        <input
          className={`${inputClass} !mt-0 pl-9`}
          placeholder="พิมพ์ชื่อ / ยศ / ตำแหน่ง / รหัสพนักงาน เพื่อค้นหาบุคลากร — ไม่พบให้กด Enter เพื่อเพิ่มชื่อเอง"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (matches.length === 1) addPerson(matches[0]!);
            else if (!matches.length) addExternal();
          }}
        />
        {open && term ? (
          <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-violet-100 bg-white p-1 shadow-xl">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addPerson(p)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-violet-50"
                >
                  <PersonAvatar name={p.fullName} photoUrl={p.photoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-[#1e1b4b]">
                      {p.rank ? <span className="mr-1 text-violet-600">{p.rank}</span> : null}
                      {p.fullName}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {[p.position, p.employeeCode].filter(Boolean).join(" · ") || "บุคลากร"}
                    </span>
                  </span>
                  <Icon name="plus" className="h-4 w-4 text-violet-500" />
                </button>
              </li>
            ))}
            {!exactExists ? (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={addExternal}
                  className="flex w-full items-center gap-2 rounded-lg border-t border-dashed border-slate-200 px-2 py-2 text-left text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <Icon name="plus" className="h-4 w-4" />
                  </span>
                  เพิ่ม “{term}” เป็นบุคคลภายนอก (ไม่มีในทะเบียนบุคลากร)
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {value.length ? (
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {value.map((v) => {
            const external = !v.personnelId;
            return (
              <li key={v.key} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                <PersonAvatar name={v.name} photoUrl={v.photoUrl} external={external} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[12.5px] font-bold text-[#1e1b4b]">
                    <span className="truncate">{v.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-black ${
                        external ? "bg-slate-100 text-slate-600" : "bg-violet-100 text-violet-700"
                      }`}
                    >
                      {external ? "ภายนอก" : "บุคลากร"}
                    </span>
                  </p>
                  {external ? (
                    <input
                      className="mt-0.5 w-full rounded-md border border-transparent bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-violet-300 focus:bg-white focus:outline-none"
                      placeholder="ตำแหน่ง / หน่วยงาน (ไม่บังคับ)"
                      value={v.affiliation}
                      onChange={(e) => onChange(value.map((x) => (x.key === v.key ? { ...x, affiliation: e.target.value } : x)))}
                    />
                  ) : (
                    <p className="truncate text-[11px] text-slate-500">{v.position || "—"}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((x) => x.key !== v.key))}
                  className="rounded-lg p-1 text-rose-500 hover:bg-rose-50"
                  title="นำออก"
                >
                  <Icon name="x" className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 rounded-xl border border-dashed border-violet-200 bg-white px-3 py-3 text-center text-xs text-slate-500">
          ยังไม่มีผู้เข้าร่วม — ค้นหาจากทะเบียนบุคลากร หรือพิมพ์ชื่อบุคคลภายนอกแล้วกด Enter
        </p>
      )}
    </div>
  );
}

function CoverStar({ active, onClick }: { active: boolean; onClick: () => void }) {
  return active ? (
    <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-amber-400 px-1.5 py-px text-[9px] font-black text-amber-950 shadow">
      <Icon name="star" className="h-2.5 w-2.5" /> ปก
    </span>
  ) : (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute left-1 top-1 rounded-full bg-white/90 p-0.5 text-amber-500 opacity-0 shadow transition hover:bg-amber-400 hover:text-amber-950 group-hover:opacity-100"
      title="ตั้งเป็นภาพปก"
    >
      <Icon name="star" className="h-3.5 w-3.5" />
    </button>
  );
}

function YouTubePlayer({ videoId, title, autoPlay = false }: { videoId: string; title?: string; autoPlay?: boolean }) {
  const [playing, setPlaying] = useState(autoPlay);
  useEffect(() => setPlaying(autoPlay), [videoId, autoPlay]);
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-md">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
          title={title || "YouTube video"}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0" title="เล่นวิดีโอ">
          <img src={youtubeThumb(videoId)} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
          <span className="absolute inset-0 bg-black/20 transition group-hover:bg-black/10" />
          <span className="absolute inset-0 flex items-center justify-center">
            <PlayBadge className="h-14 w-14 transition group-hover:scale-110" />
          </span>
          <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">กดเพื่อเล่น</span>
        </button>
      )}
    </div>
  );
}

function Icon({ name, className = "h-4 w-4" }: { name: keyof typeof ICON_PATHS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

const SECTION_TONES = {
  indigo: { wrap: "border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-white", icon: "from-[#0000BF] to-[#8b5cf6]" },
  sky: { wrap: "border-sky-100 bg-gradient-to-br from-sky-50/70 via-white to-white", icon: "from-sky-500 to-cyan-400" },
  emerald: { wrap: "border-emerald-100 bg-gradient-to-br from-emerald-50/70 via-white to-white", icon: "from-emerald-500 to-teal-400" },
  amber: { wrap: "border-amber-100 bg-gradient-to-br from-amber-50/70 via-white to-white", icon: "from-amber-500 to-orange-400" },
  pink: { wrap: "border-pink-100 bg-gradient-to-br from-pink-50/70 via-white to-white", icon: "from-pink-500 to-fuchsia-400" },
  red: { wrap: "border-red-100 bg-gradient-to-br from-red-50/70 via-white to-white", icon: "from-red-600 to-rose-500" },
  violet: { wrap: "border-violet-100 bg-gradient-to-br from-violet-50/70 via-white to-white", icon: "from-violet-500 to-purple-400" },
} as const;

function FormSection({
  tone,
  icon,
  title,
  hint,
  right,
  children,
}: {
  tone: keyof typeof SECTION_TONES;
  icon: keyof typeof ICON_PATHS;
  title: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  const t = SECTION_TONES[tone];
  return (
    <section className={`rounded-2xl border p-4 shadow-sm ${t.wrap}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${t.icon}`}>
          <Icon name={icon} className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-[#1e1b4b]">{title}</h3>
          {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function DropZone({
  accept,
  icon,
  title,
  hint,
  tone,
  onFiles,
}: {
  accept: string;
  icon: keyof typeof ICON_PATHS;
  title: string;
  hint: string;
  tone: "amber" | "pink";
  onFiles: (files: File[]) => void;
}) {
  const [over, setOver] = useState(false);
  const toneCls =
    tone === "amber"
      ? over
        ? "border-amber-400 bg-amber-50"
        : "border-amber-200 hover:border-amber-400 hover:bg-amber-50/60"
      : over
        ? "border-pink-400 bg-pink-50"
        : "border-pink-200 hover:border-pink-400 hover:bg-pink-50/60";
  const iconCls = tone === "amber" ? "text-amber-500" : "text-pink-500";
  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files?.length) onFiles(Array.from(e.dataTransfer.files));
  }
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-4 text-center transition ${toneCls}`}
    >
      <Icon name={icon} className={`h-7 w-7 ${iconCls}`} />
      <span className="text-sm font-bold text-[#2e2a58]">{title}</span>
      <span className="text-[11px] text-slate-500">{hint}</span>
      <input
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </label>
  );
}

function FileRow({
  name,
  mime,
  size,
  href,
  badge,
  onRemove,
}: {
  name: string;
  mime?: string | null;
  size?: number | null;
  href?: string;
  badge?: string;
  onRemove?: () => void;
}) {
  const k = fileKind(name, mime);
  return (
    <li className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
      <span className={`flex h-8 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${k.cls}`}>{k.label}</span>
      <div className="min-w-0 flex-1">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="block truncate text-[12.5px] font-semibold text-[#0000BF] hover:underline" title={name}>
            {name}
          </a>
        ) : (
          <p className="truncate text-[12.5px] font-semibold text-[#1e1b4b]" title={name}>
            {name}
          </p>
        )}
        <p className="text-[10.5px] text-slate-500">
          {formatSize(size)}
          {badge ? <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-px font-bold text-amber-700">{badge}</span> : null}
        </p>
      </div>
      {href ? (
        <a href={href} download className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#0000BF]" title="ดาวน์โหลด">
          <Icon name="download" />
        </a>
      ) : null}
      {onRemove ? (
        <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" title="ลบ">
          <Icon name="trash" />
        </button>
      ) : null}
    </li>
  );
}

function BudgetSummary({ budget, spent }: { budget: number; spent: number }) {
  const remain = budget - spent;
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : spent > 0 ? 100 : 0;
  const over = budget > 0 && spent > budget;
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-3">
      <div className="grid grid-cols-3 gap-2 text-right">
        <div>
          <p className="text-[10.5px] font-bold text-slate-500">งบประมาณ</p>
          <p className="text-sm font-black tabular-nums text-[#1e1b4b]">{baht(budget)}</p>
        </div>
        <div>
          <p className="text-[10.5px] font-bold text-slate-500">ค่าใช้จ่ายรวม</p>
          <p className="text-sm font-black tabular-nums text-[#0000BF]">{baht(spent)}</p>
        </div>
        <div>
          <p className="text-[10.5px] font-bold text-slate-500">{over ? "เกินงบ" : "คงเหลือ"}</p>
          <p className={`text-sm font-black tabular-nums ${over ? "text-rose-600" : "text-emerald-600"}`}>{baht(Math.abs(remain))}</p>
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${over ? "bg-rose-500" : pct >= 80 ? "bg-amber-400" : "bg-gradient-to-r from-emerald-400 to-teal-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-right text-[10.5px] text-slate-500">
        {budget > 0 ? `ใช้ไป ${((spent / budget) * 100).toFixed(1)}% ของงบ` : "ยังไม่ได้ระบุงบประมาณ"}
      </p>
    </div>
  );
}

function activityTotals(a: Activity) {
  const spent = a.expenses.reduce((s, e) => s + num(e.amount), 0);
  return { budget: num(a.budgetAmount), spent };
}

export function ActivitiesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Activity[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [recordedBy, setRecordedBy] = useState("");
  const [notionUrl, setNotionUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [pendingCoverIndex, setPendingCoverIndex] = useState<number | null>(null);
  const [videoFor, setVideoFor] = useState<Activity | null>(null);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);
  const [people, setPeople] = useState<PersonOption[] | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [expenses, setExpenses] = useState<ExpenseDraft[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [pendingDocs, setPendingDocs] = useState<File[]>([]);
  const [existingDocs, setExistingDocs] = useState<WorkTaskAttachment[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<WorkTaskPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lightboxUrls, setLightboxUrls] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxTitle, setLightboxTitle] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState("");
  const [detail, setDetail] = useState<Activity | null>(null);

  const photoPreviews = useMemo(() => pendingPhotos.map((f) => URL.createObjectURL(f)), [pendingPhotos]);
  useEffect(() => () => photoPreviews.forEach((u) => URL.revokeObjectURL(u)), [photoPreviews]);

  const expenseTotal = expenses.reduce((s, e) => s + num(e.quantity) * num(e.unitPrice), 0);

  const categoryColorById = useMemo(
    () => new Map(categories.map((c, i) => [c.id, ACTIVITY_CATEGORY_COLORS[i % ACTIVITY_CATEGORY_COLORS.length]!])),
    [categories],
  );
  const colorOfCategory = (id: string | null | undefined) => (id ? categoryColorById.get(id) : undefined) ?? "#64748b";

  const filteredItems = useMemo(
    () =>
      items.filter((a) =>
        (categoryFilter === "" || (categoryFilter === "none" ? !a.categoryId : a.categoryId === categoryFilter)) &&
        rowMatchesFilter(listFilter, [
          a.title,
          a.category?.name,
          ...a.participants.map((p) => p.name),
          a.description,
          a.location,
          a.recordedBy,
          statusLabel[a.status],
          a.notionUrl,
          ...a.expenses.map((e) => `${e.category ?? ""} ${e.item}`),
        ]),
      ),
    [items, listFilter, categoryFilter],
  );

  const loadCategories = useCallback(async () => {
    setCategories(await apiJson<ActivityCategory[]>("/api/activity-categories"));
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (categoryFilter && categoryFilter !== "none" && categories.length && !categories.some((c) => c.id === categoryFilter))
      setCategoryFilter("");
  }, [categories, categoryFilter]);

  const load = useCallback(async () => {
    const next = await apiJson<Activity[]>("/api/tasks");
    setItems(next);
    return next;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function ensurePeople() {
    if (people) return;
    setPeople([]);
    apiJson<PersonOption[]>("/api/personnel")
      .then((rows) =>
        setPeople(
          rows.map((p) => ({
            id: p.id,
            fullName: p.fullName,
            rank: p.rank,
            position: p.position,
            photoUrl: p.photoUrl,
            employeeCode: p.employeeCode,
          })),
        ),
      )
      .catch(() => setPeople(null));
  }

  function resetFiles() {
    setPendingPhotos([]);
    setPendingDocs([]);
    setPendingCoverIndex(null);
  }

  function removePendingPhoto(i: number) {
    setPendingPhotos((l) => l.filter((_, j) => j !== i));
    setPendingCoverIndex((c) => (c === null || c === i ? null : c > i ? c - 1 : c));
  }

  function openCreate() {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setLocation("");
    setRecordedBy(user?.fullName || user?.username || "");
    setNotionUrl("");
    setYoutubeUrl("");
    setCategoryId(categoryFilter && categoryFilter !== "none" ? categoryFilter : "");
    setParticipants([]);
    ensurePeople();
    setStartsAt("");
    setEndsAt("");
    setBudgetAmount("");
    setExpenses([]);
    setExistingDocs([]);
    setExistingPhotos([]);
    resetFiles();
    setErr(null);
    setModalOpen(true);
  }

  function openEdit(a: Activity) {
    setDetail(null);
    setEditingId(a.id);
    setTitle(a.title);
    setDescription(a.description ?? "");
    setLocation(a.location ?? "");
    setRecordedBy(a.recordedBy ?? "");
    setNotionUrl(a.notionUrl ?? "");
    setYoutubeUrl(a.youtubeUrl ?? "");
    setCategoryId(a.categoryId ?? "");
    setParticipants(
      a.participants.map((p) => ({
        key: `p${++draftSeq}`,
        personnelId: p.personnelId,
        name: p.name,
        affiliation: p.affiliation ?? "",
        photoUrl: p.personnel?.photoUrl ?? null,
        position: p.personnel?.position ?? null,
      })),
    );
    ensurePeople();
    setStartsAt(toDatetimeLocalValue(a.startsAt));
    setEndsAt(toDatetimeLocalValue(a.endsAt));
    setBudgetAmount(a.budgetAmount != null ? String(num(a.budgetAmount)) : "");
    setExpenses(
      a.expenses.map((e) => ({
        key: `d${++draftSeq}`,
        category: e.category ?? "",
        item: e.item,
        quantity: String(num(e.quantity)),
        unitPrice: String(num(e.unitPrice)),
        note: e.note ?? "",
      })),
    );
    setExistingDocs(a.attachments);
    setExistingPhotos(a.photos);
    resetFiles();
    setErr(null);
    setModalOpen(true);
  }

  function updateExpense(key: string, patch: Partial<ExpenseDraft>) {
    setExpenses((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }

  async function uploadDocs(id: string, files: File[]) {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    const res = await apiFormJson<{ created: WorkTaskAttachment[]; failed: string[] }>(`/api/tasks/${id}/attachments`, fd);
    if (res.failed?.length) alert(`บางไฟล์อัปโหลดไม่สำเร็จ:\n${res.failed.join("\n")}`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (youtubeUrl.trim() && !youtubeId(youtubeUrl)) {
      setErr("ลิงก์ YouTube ไม่ถูกต้อง");
      return;
    }
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      recordedBy: recordedBy.trim() || null,
      notionUrl: notionUrl.trim() || null,
      youtubeUrl: youtubeUrl.trim() || null,
      categoryId: categoryId || null,
      participants: participants.map((p) => ({ personnelId: p.personnelId, name: p.name, affiliation: p.affiliation || null })),
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      budgetAmount: budgetAmount.trim() === "" ? null : budgetAmount,
      expenses: expenses.map((x) => ({
        category: x.category || null,
        item: x.item,
        quantity: x.quantity || "1",
        unitPrice: x.unitPrice || "0",
        note: x.note || null,
      })),
    };

    setSaving(true);
    try {
      let id = editingId;
      if (editingId) {
        await apiJson(`/api/tasks/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        const created = await apiJson<Activity>("/api/tasks", { method: "POST", body: JSON.stringify(body) });
        id = created.id;
      }

      if (pendingPhotos.length && id) {
        const prepared = await prepareFilesForUpload(pendingPhotos);
        const fd = new FormData();
        for (const f of prepared) fd.append("photos", f);
        const created = await apiFormJson<WorkTaskPhoto[]>(`/api/tasks/${id}/photos`, fd);
        const cover = pendingCoverIndex !== null ? created[pendingCoverIndex] : undefined;
        if (cover) await apiJson(`/api/tasks/${id}/photos/${cover.id}/cover`, { method: "PUT" });
      }
      if (pendingDocs.length && id) await uploadDocs(id, pendingDocs);

      setModalOpen(false);
      resetFiles();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function setTaskStatus(id: string, s: WorkTaskStatus) {
    await apiJson(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status: s }) });
    await load();
  }

  async function removeTask(id: string) {
    if (!confirm("ลบกิจกรรมนี้?")) return;
    await apiJson(`/api/tasks/${id}`, { method: "DELETE" });
    setDetail(null);
    await load();
  }

  async function refreshDetail(taskId: string) {
    const next = await load();
    const found = next.find((x) => x.id === taskId) ?? null;
    setDetail((cur) => (cur && cur.id === taskId ? found : cur));
    if (editingId === taskId && found) {
      setExistingDocs(found.attachments);
      setExistingPhotos(found.photos);
    }
  }

  async function removePhoto(taskId: string, photoId: string) {
    if (!confirm("ลบรูปนี้?")) return;
    await apiJson(`/api/tasks/${taskId}/photos/${photoId}`, { method: "DELETE" });
    await refreshDetail(taskId);
  }

  async function setCover(taskId: string, photoId: string) {
    await apiJson(`/api/tasks/${taskId}/photos/${photoId}/cover`, { method: "PUT" });
    setPendingCoverIndex(null);
    await refreshDetail(taskId);
  }

  async function removeAttachment(taskId: string, attachmentId: string) {
    if (!confirm("ลบไฟล์แนบนี้?")) return;
    await apiJson(`/api/tasks/${taskId}/attachments/${attachmentId}`, { method: "DELETE" });
    await refreshDetail(taskId);
  }

  async function addPhotosToTask(taskId: string, files: FileList | null) {
    if (!files?.length) return;
    const prepared = await prepareFilesForUpload(files);
    const fd = new FormData();
    for (const f of prepared) fd.append("photos", f);
    await apiFormJson(`/api/tasks/${taskId}/photos`, fd);
    await refreshDetail(taskId);
  }

  async function addDocsToTask(taskId: string, files: FileList | null) {
    if (!files?.length) return;
    await uploadDocs(taskId, Array.from(files));
    await refreshDetail(taskId);
  }

  const detailTotals = detail ? activityTotals(detail) : null;

  return (
    <div>
      <PageHeaderBar
        title="กิจกรรม"
        count={filteredItems.length}
        filter={{
          value: listFilter,
          onChange: setListFilter,
          printTitle: "กิจกรรม",
          placeholder: "กรองหัวข้อ / หมวดหมู่ / รายละเอียด / สถานที่ / ผู้บันทึก / สถานะ / ค่าใช้จ่าย…",
        }}
        masters={
          <div className={toolbarMasterGroupClass}>
            <button type="button" onClick={() => setCategoryModalOpen(true)} className={toolbarMasterBtnClass}>
              หมวดหมู่
            </button>
          </div>
        }
        primary={
          <button type="button" onClick={openCreate} className={toolbarPrimaryBtnClass}>
            เพิ่มกิจกรรม
          </button>
        }
      />

      <CrudNameMasterModal
        title="จัดการหมวดหมู่กิจกรรม"
        apiPath="/api/activity-categories"
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onChanged={() => {
          void loadCategories();
          void load();
        }}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#0000BF] via-[#8b5cf6] to-[#ec4899] text-white">
              <Icon name="flag" className="h-4 w-4" />
            </span>
            {editingId ? "แก้ไขกิจกรรม" : "เพิ่มกิจกรรม"}
          </span>
        }
        size="wide"
      >
        <form onSubmit={(e) => void submit(e)}>
          <ModalFormBody>
            {err && <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
            <div className="space-y-4">
              <FormSection tone="indigo" icon="info" title="ข้อมูลกิจกรรม" hint="หมวดหมู่ หัวข้อ และรายละเอียด">
                <div className="grid gap-3">
                  <div>
                    <span className={`${labelClass} flex items-center justify-between gap-2`}>
                      <span className="inline-flex items-center gap-1">
                        <Icon name="tag" className="h-3.5 w-3.5 text-[#8b5cf6]" /> หมวดหมู่กิจกรรม
                      </span>
                      <button
                        type="button"
                        onClick={() => setCategoryModalOpen(true)}
                        className="text-[11px] font-bold text-[#4d47b6] hover:text-[#0000BF] hover:underline"
                      >
                        จัดการหมวดหมู่
                      </button>
                    </span>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {[{ id: "", name: "ไม่ระบุ" }, ...categories].map((c) => {
                        const on = categoryId === c.id;
                        const color = c.id ? colorOfCategory(c.id) : "#94a3b8";
                        return (
                          <button
                            key={c.id || "none"}
                            type="button"
                            onClick={() => setCategoryId(c.id)}
                            aria-pressed={on}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                              on ? "text-white shadow-md" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                            style={on ? { backgroundColor: color, borderColor: color } : undefined}
                          >
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: on ? "#fff" : color }} />
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <label className="block">
                    <span className={labelClass}>
                      หัวข้อกิจกรรม <span className="text-rose-500">*</span>
                    </span>
                    <input required className={inputClass} placeholder="เช่น ประชุมวางแผนภารกิจประจำเดือน" value={title} onChange={(e) => setTitle(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>รายละเอียด</span>
                    <textarea rows={3} className={inputClass} placeholder="วัตถุประสงค์ ผู้เข้าร่วม ผลที่ได้…" value={description} onChange={(e) => setDescription(e.target.value)} />
                  </label>
                </div>
              </FormSection>

              <FormSection tone="sky" icon="clock" title="วันเวลาและสถานที่">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelClass}>ตั้งแต่เวลา</span>
                    <input type="datetime-local" className={inputClass} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>ถึงเวลา</span>
                    <input type="datetime-local" className={inputClass} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className={`${labelClass} inline-flex items-center gap-1`}>
                      <Icon name="pin" className="h-3.5 w-3.5 text-sky-500" /> สถานที่
                    </span>
                    <input className={inputClass} placeholder="เช่น ห้องประชุม 1 อาคาร 2" value={location} onChange={(e) => setLocation(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className={`${labelClass} inline-flex items-center gap-1`}>
                      <Icon name="user" className="h-3.5 w-3.5 text-sky-500" /> ผู้บันทึก
                    </span>
                    <input className={inputClass} value={recordedBy} onChange={(e) => setRecordedBy(e.target.value)} />
                  </label>
                </div>
              </FormSection>

              <FormSection
                tone="violet"
                icon="users"
                title="ผู้เข้าร่วมกิจกรรม"
                hint="เลือกจากทะเบียนบุคลากร หรือเพิ่มชื่อบุคคลภายนอก"
                right={
                  participants.length ? (
                    <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-black text-violet-700">
                      {participants.length} คน
                      {participants.some((p) => !p.personnelId) ? ` · ภายนอก ${participants.filter((p) => !p.personnelId).length}` : ""}
                    </span>
                  ) : null
                }
              >
                <ParticipantPicker people={people ?? []} value={participants} onChange={setParticipants} />
              </FormSection>

              <FormSection
                tone="emerald"
                icon="wallet"
                title="งบประมาณค่าใช้จ่าย"
                hint="ระบุงบที่ตั้งไว้ และรายการค่าใช้จ่ายจริง — ระบบคำนวณยอดรวมให้"
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                  <label className="block">
                    <span className={labelClass}>งบประมาณที่ตั้งไว้ (บาท)</span>
                    <CommaNumberInput
                      className={`${inputClass} text-right font-bold tabular-nums`}
                      placeholder="0.00"
                      maxFractionDigits={2}
                      value={budgetAmount}
                      onChange={setBudgetAmount}
                    />
                  </label>
                  <BudgetSummary budget={num(budgetAmount)} spent={expenseTotal} />
                </div>

                <div className="mt-3 overflow-x-auto rounded-xl border border-emerald-100 bg-white">
                  <div className="grid min-w-[40rem] grid-cols-[11rem_minmax(0,1fr)_5rem_8rem_8rem_2rem] gap-2 border-b border-emerald-100 bg-emerald-50/70 px-2.5 py-1.5 text-[10.5px] font-bold text-emerald-800">
                    <span>หมวด</span>
                    <span>รายการ</span>
                    <span className="text-right">จำนวน</span>
                    <span className="text-right">ราคา/หน่วย</span>
                    <span className="text-right">รวม (บาท)</span>
                    <span />
                  </div>
                  {expenses.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-slate-500">ยังไม่มีรายการค่าใช้จ่าย — กด «เพิ่มรายการ» หรือเลือกหมวดด้านล่าง</p>
                  ) : (
                    <ul className="min-w-[40rem] divide-y divide-slate-100">
                      {expenses.map((x) => (
                        <li key={x.key} className="grid grid-cols-[11rem_minmax(0,1fr)_5rem_8rem_8rem_2rem] items-center gap-2 px-2.5 py-1.5">
                          <div className="relative">
                            <span
                              className="pointer-events-none absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
                              style={{ backgroundColor: categoryColor(x.category) }}
                            />
                            <select
                              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-5 pr-1 text-xs text-slate-800 focus:border-emerald-400 focus:outline-none"
                              value={x.category}
                              onChange={(e) => updateExpense(x.key, { category: e.target.value })}
                            >
                              <option value="">— เลือกหมวด —</option>
                              {EXPENSE_CATEGORIES.map((c) => (
                                <option key={c.name} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <input
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-emerald-400 focus:outline-none"
                            placeholder="เช่น อาหารกลางวัน 20 ชุด"
                            value={x.item}
                            onChange={(e) => updateExpense(x.key, { item: e.target.value })}
                          />
                          <CommaNumberInput
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-right text-xs tabular-nums focus:border-emerald-400 focus:outline-none"
                            maxFractionDigits={2}
                            value={x.quantity}
                            onChange={(v) => updateExpense(x.key, { quantity: v })}
                          />
                          <CommaNumberInput
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-right text-xs tabular-nums focus:border-emerald-400 focus:outline-none"
                            placeholder="0.00"
                            maxFractionDigits={2}
                            value={x.unitPrice}
                            onChange={(v) => updateExpense(x.key, { unitPrice: v })}
                          />
                          <span className="text-right text-xs font-bold tabular-nums text-[#1e1b4b]">
                            {baht(num(x.quantity) * num(x.unitPrice))}
                          </span>
                          <button
                            type="button"
                            onClick={() => setExpenses((l) => l.filter((e) => e.key !== x.key))}
                            className="rounded-lg p-1 text-rose-500 hover:bg-rose-50"
                            title="ลบรายการ"
                          >
                            <Icon name="trash" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex min-w-[40rem] items-center justify-between gap-2 border-t border-emerald-100 bg-emerald-50/40 px-2.5 py-2">
                    <button
                      type="button"
                      onClick={() => setExpenses((l) => [...l, newDraft()])}
                      className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:from-emerald-600 hover:to-teal-600"
                    >
                      <Icon name="plus" className="h-3.5 w-3.5" /> เพิ่มรายการ
                    </button>
                    <span className="text-xs font-bold text-emerald-900">
                      รวมทั้งสิ้น <span className="ml-1 text-sm font-black tabular-nums">{baht(expenseTotal)}</span> บาท
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {EXPENSE_CATEGORIES.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => setExpenses((l) => [...l, newDraft(c.name)])}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />+ {c.name}
                    </button>
                  ))}
                </div>
              </FormSection>

              <div className="grid gap-4 lg:grid-cols-2">
                <FormSection tone="amber" icon="clip" title="เอกสารแนบ" hint="PDF, Word, Excel, PowerPoint หรือรูปภาพ เช่น หนังสืออนุมัติ ใบเสร็จ">
                  <DropZone
                    tone="amber"
                    icon="upload"
                    accept={DOC_ACCEPT}
                    title="ลากไฟล์มาวาง หรือคลิกเพื่อเลือก"
                    hint="เลือกได้หลายไฟล์"
                    onFiles={(f) => setPendingDocs((l) => [...l, ...f])}
                  />
                  {existingDocs.length || pendingDocs.length ? (
                    <ul className="mt-2 space-y-1.5">
                      {existingDocs.map((d) => (
                        <FileRow
                          key={d.id}
                          name={d.originalName || "ไฟล์แนบ"}
                          mime={d.mimeType}
                          size={d.fileSize}
                          href={d.fileUrl}
                          onRemove={editingId ? () => void removeAttachment(editingId, d.id) : undefined}
                        />
                      ))}
                      {pendingDocs.map((f, i) => (
                        <FileRow
                          key={`${f.name}-${i}`}
                          name={f.name}
                          mime={f.type}
                          size={f.size}
                          badge="รออัปโหลด"
                          onRemove={() => setPendingDocs((l) => l.filter((_, j) => j !== i))}
                        />
                      ))}
                    </ul>
                  ) : null}
                </FormSection>

                <FormSection tone="pink" icon="photo" title="รูปถ่ายกิจกรรม" hint="รูปจะถูกย่อขนาดอัตโนมัติก่อนอัปโหลด">
                  <DropZone
                    tone="pink"
                    icon="photo"
                    accept="image/*"
                    title="ลากรูปมาวาง หรือคลิกเพื่อเลือก"
                    hint="เลือกได้หลายรูป"
                    onFiles={(f) => setPendingPhotos((l) => [...l, ...f.filter((x) => x.type.startsWith("image/"))])}
                  />
                  {existingPhotos.length || pendingPhotos.length ? (
                    <>
                      <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
                        {existingPhotos.map((p, i) => {
                          const isCover =
                            pendingCoverIndex === null && (p.isCover || (i === 0 && !existingPhotos.some((x) => x.isCover)));
                          return (
                            <div
                              key={p.id}
                              className={`group relative aspect-square overflow-hidden rounded-lg border ${isCover ? "border-amber-400 ring-2 ring-amber-300" : "border-pink-100"}`}
                            >
                              <img src={p.fileUrl} alt="" className="h-full w-full object-cover" />
                              {editingId ? (
                                <>
                                  <CoverStar active={isCover} onClick={() => void setCover(editingId, p.id)} />
                                  <button
                                    type="button"
                                    onClick={() => void removePhoto(editingId, p.id)}
                                    className="absolute right-1 top-1 rounded-full bg-rose-600 p-0.5 text-white opacity-0 shadow group-hover:opacity-100"
                                    title="ลบรูป"
                                  >
                                    <Icon name="trash" className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              ) : null}
                            </div>
                          );
                        })}
                        {photoPreviews.map((u, i) => {
                          const isCover = pendingCoverIndex === i || (pendingCoverIndex === null && existingPhotos.length === 0 && i === 0);
                          return (
                            <div
                              key={u}
                              className={`group relative aspect-square overflow-hidden rounded-lg border-2 border-dashed ${isCover ? "border-amber-400 ring-2 ring-amber-300" : "border-pink-300"}`}
                            >
                              <img src={u} alt="" className="h-full w-full object-cover opacity-90" />
                              <span className="absolute inset-x-0 bottom-0 bg-pink-500/85 py-px text-center text-[9px] font-bold text-white">ใหม่</span>
                              <CoverStar active={isCover} onClick={() => setPendingCoverIndex(i)} />
                              <button
                                type="button"
                                onClick={() => removePendingPhoto(i)}
                                className="absolute right-1 top-1 rounded-full bg-rose-600 p-0.5 text-white opacity-0 shadow group-hover:opacity-100"
                                title="นำออก"
                              >
                                <Icon name="trash" className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] text-slate-500">
                        <Icon name="star" className="h-3 w-3 text-amber-500" /> กดดาวที่รูปเพื่อตั้งเป็นภาพปกของการ์ด
                      </p>
                    </>
                  ) : null}
                </FormSection>
              </div>

              <FormSection tone="red" icon="video" title="วิดีโอ YouTube" hint="วางลิงก์วิดีโอ — แสดงตัวอย่างและกดเล่นได้ทันที">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] md:items-start">
                  <label className="block">
                    <span className={`${labelClass} inline-flex items-center gap-1`}>
                      <Icon name="link" className="h-3.5 w-3.5 text-red-500" /> ลิงก์ YouTube (ไม่บังคับ)
                    </span>
                    <input
                      type="url"
                      placeholder="เช่น https://www.youtube.com/watch?v=… หรือ https://youtu.be/…"
                      className={`${inputClass} font-mono`}
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                    />
                    {youtubeUrl.trim() && !youtubeId(youtubeUrl) ? (
                      <span className="mt-1 block text-[11px] font-semibold text-rose-600">ลิงก์ไม่ถูกต้อง — รองรับ youtube.com/watch, youtu.be, shorts</span>
                    ) : null}
                  </label>
                  {youtubeId(youtubeUrl) ? (
                    <YouTubePlayer videoId={youtubeId(youtubeUrl)!} title={title} />
                  ) : (
                    <div className="flex aspect-video items-center justify-center rounded-xl border-2 border-dashed border-red-200 bg-white text-red-300">
                      <PlayBadge className="h-10 w-10 opacity-40" />
                    </div>
                  )}
                </div>
              </FormSection>

              <label className="block rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                <span className={`${labelClass} inline-flex items-center gap-1`}>
                  <Icon name="link" className="h-3.5 w-3.5 text-slate-500" /> ลิงก์ Notion (ไม่บังคับ)
                </span>
                <input
                  type="url"
                  placeholder="https://www.notion.so/..."
                  className={`${inputClass} font-mono`}
                  value={notionUrl}
                  onChange={(e) => setNotionUrl(e.target.value)}
                />
              </label>
            </div>
          </ModalFormBody>
          <ModalFormActions className="justify-center">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-6 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777] disabled:opacity-60"
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button type="button" className="rounded-full border border-slate-200 px-5 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setModalOpen(false)}>
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <ImageLightbox
        open={!!lightboxUrls?.length}
        urls={lightboxUrls ?? []}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        title={lightboxTitle}
        onClose={() => setLightboxUrls(null)}
      />

      <div className="mt-6 print:hidden">
        {items.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {[
              { id: "", name: "ทั้งหมด", count: items.length, color: "#1e1b4b" },
              ...categories.map((c) => ({
                id: c.id,
                name: c.name,
                count: items.filter((a) => a.categoryId === c.id).length,
                color: colorOfCategory(c.id),
              })),
              ...(items.some((a) => !a.categoryId)
                ? [{ id: "none", name: "ไม่ระบุหมวด", count: items.filter((a) => !a.categoryId).length, color: "#94a3b8" }]
                : []),
            ].map((c) => {
              const on = categoryFilter === c.id;
              return (
                <button
                  key={c.id || "all"}
                  type="button"
                  onClick={() => setCategoryFilter(c.id)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                    on ? "text-white shadow-md" : "border-[#e8e6fc] bg-white/90 text-[#2e2a58] hover:border-[#c9c4f2]"
                  }`}
                  style={on ? { backgroundColor: c.color, borderColor: c.color } : undefined}
                >
                  {c.id ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: on ? "#fff" : c.color }} /> : <Icon name="tag" className="h-3.5 w-3.5" />}
                  {c.name}
                  <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${on ? "bg-white/25" : "bg-slate-100 text-slate-600"}`}>{c.count}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {items.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ยังไม่มีกิจกรรม — กด «เพิ่มกิจกรรม»
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-[1.15rem] border border-dashed border-[#dcd8f0] bg-white/70 px-4 py-10 text-center text-slate-600">
            ไม่มีรายการที่ตรงกับการกรอง
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredItems.map((a, idx) => {
              const t = activityTotals(a);
              const over = t.budget > 0 && t.spent > t.budget;
              const cover = coverPhoto(a);
              const ytId = youtubeId(a.youtubeUrl);
              const coverSrc = cover?.fileUrl ?? (ytId ? youtubeThumb(ytId) : null);
              return (
                <li key={a.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetail(a)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetail(a);
                      }
                    }}
                    className={`${listCardClass} cursor-pointer !p-0 transition hover:-translate-y-0.5 hover:border-[#0000BF]/35`}
                  >
                    <div className={`relative aspect-[16/9] w-full shrink-0 overflow-hidden ${coverSrc ? "bg-slate-200" : listCardAccentClass(idx)}`}>
                      {coverSrc ? (
                        <img src={coverSrc} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-white/80">
                          <Icon name="flag" className="h-12 w-12" />
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/45 to-transparent" aria-hidden />
                      <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm backdrop-blur ${activityStatusChip[a.status]} !bg-white/90`}>
                        {statusLabel[a.status]}
                      </span>
                      {ytId ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setVideoFor(a);
                          }}
                          className={`absolute ${cover ? "bottom-2 right-2" : "inset-0 m-auto h-fit w-fit"} transition hover:scale-110`}
                          title="เล่นวิดีโอ YouTube"
                        >
                          <PlayBadge className={cover ? "h-9 w-9" : "h-12 w-12"} />
                        </button>
                      ) : null}
                      {a.photos.length ? (
                        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white">
                          <Icon name="photo" className="h-3 w-3" /> {a.photos.length}
                        </span>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 px-3.5 pt-3">
                      {a.category ? (
                        <span
                          className="mb-1 inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: `${colorOfCategory(a.categoryId)}1a`, color: colorOfCategory(a.categoryId) }}
                        >
                          <Icon name="tag" className="h-3 w-3 shrink-0" /> {a.category.name}
                        </span>
                      ) : null}
                      <h2 className="line-clamp-2 text-sm font-bold text-[#1e1b4b]">{a.title}</h2>
                      <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-slate-600">
                        <Icon name="clock" className="h-3.5 w-3.5 text-[#4d47b6]" /> {formatWhen(a.startsAt)} → {formatWhen(a.endsAt)}
                      </p>
                      <p className="mt-1 flex items-center gap-1 truncate text-xs text-[#2e2a58]">
                        <Icon name="pin" className="h-3.5 w-3.5 shrink-0 text-sky-500" /> {a.location || "—"}
                      </p>
                      {a.description ? <p className="mt-2 line-clamp-2 text-xs text-slate-700">{a.description}</p> : null}
                      {t.budget > 0 || t.spent > 0 || a.attachments.length > 0 || a.participants.length > 0 ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px] font-bold">
                          {a.participants.length ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-violet-100 py-0.5 pl-0.5 pr-2 text-violet-700"
                              title={a.participants.map((p) => p.name).join("\n")}
                            >
                              <span className="flex -space-x-1.5">
                                {a.participants.slice(0, 3).map((p) => (
                                  <PersonAvatar key={p.id} name={p.name} photoUrl={p.personnel?.photoUrl} external={!p.personnelId} small />
                                ))}
                              </span>
                              {a.participants.length} คน
                            </span>
                          ) : null}
                          {t.budget > 0 || t.spent > 0 ? (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                                over ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              <Icon name="wallet" className="h-3 w-3" />
                              {baht(t.spent)}
                              {t.budget > 0 ? ` / ${baht(t.budget)}` : ""}
                            </span>
                          ) : null}
                          {a.attachments.length ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                              <Icon name="clip" className="h-3 w-3" /> {a.attachments.length} ไฟล์
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div
                      className="mx-3.5 mb-3 mt-3 flex flex-wrap items-center gap-1.5 border-t border-[#ecebff] pt-2.5"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <select
                        className="rounded-lg border border-[#dcd8f0] bg-white px-2 py-1 text-xs text-slate-900"
                        value={a.status}
                        onChange={(e) => void setTaskStatus(a.id, e.target.value as WorkTaskStatus)}
                      >
                        {statuses.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel[s]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                        onClick={() => openEdit(a)}
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
                        onClick={() => void removeTask(a.id)}
                      >
                        ลบ
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.title ?? "รายละเอียดกิจกรรม"} size="wide">
        {detail && detailTotals ? (
          <>
            <ModalFormBody>
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField
                  label="หมวดหมู่"
                  value={
                    detail.category ? (
                      <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: colorOfCategory(detail.categoryId) }}>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorOfCategory(detail.categoryId) }} />
                        {detail.category.name}
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
                <DetailField label="สถานะ" value={statusLabel[detail.status]} />
                <DetailField label="ผู้บันทึก" value={detail.recordedBy || "—"} />
                <DetailField label="เริ่ม" value={formatWhen(detail.startsAt)} />
                <DetailField label="สิ้นสุด" value={formatWhen(detail.endsAt)} />
                <DetailField label="สถานที่" value={detail.location || "—"} className="sm:col-span-2" />
                <DetailField
                  label="รายละเอียด"
                  value={detail.description ? <span className="whitespace-pre-wrap">{detail.description}</span> : "—"}
                  className="sm:col-span-2"
                />
                {detail.notionUrl ? (
                  <DetailField
                    label="Notion"
                    value={
                      <a href={detail.notionUrl} target="_blank" rel="noopener noreferrer" className="text-[#0000BF] underline">
                        เปิดลิงก์ ↗
                      </a>
                    }
                    className="sm:col-span-2"
                  />
                ) : null}
              </div>

              <div className="mt-4 space-y-4">
                {youtubeId(detail.youtubeUrl) ? (
                  <FormSection
                    tone="red"
                    icon="video"
                    title="วิดีโอ YouTube"
                    right={
                      <a
                        href={detail.youtubeUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50"
                      >
                        เปิดใน YouTube ↗
                      </a>
                    }
                  >
                    <div className="mx-auto max-w-2xl">
                      <YouTubePlayer videoId={youtubeId(detail.youtubeUrl)!} title={detail.title} />
                    </div>
                  </FormSection>
                ) : null}

                <FormSection tone="violet" icon="users" title={`ผู้เข้าร่วมกิจกรรม (${detail.participants.length} คน)`}>
                  {detail.participants.length ? (
                    <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                      {detail.participants.map((p, i) => (
                        <li key={p.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                          <span className="w-5 shrink-0 text-right text-[10.5px] font-bold tabular-nums text-slate-400">{i + 1}</span>
                          <PersonAvatar name={p.name} photoUrl={p.personnel?.photoUrl} external={!p.personnelId} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12.5px] font-bold text-[#1e1b4b]">{p.name}</p>
                            <p className="truncate text-[11px] text-slate-500">
                              {p.personnelId ? p.personnel?.position || "บุคลากร" : p.affiliation || "บุคคลภายนอก"}
                            </p>
                          </div>
                          {!p.personnelId ? (
                            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-px text-[9px] font-black text-slate-600">ภายนอก</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500">ยังไม่มีรายชื่อผู้เข้าร่วม</p>
                  )}
                </FormSection>

                <FormSection tone="emerald" icon="wallet" title="งบประมาณค่าใช้จ่าย">
                  <BudgetSummary budget={detailTotals.budget} spent={detailTotals.spent} />
                  {detail.expenses.length ? (
                    <div className="mt-2 overflow-x-auto rounded-xl border border-emerald-100 bg-white">
                      <table className="w-full min-w-[34rem] text-xs">
                        <thead className="bg-emerald-50/70 text-[10.5px] text-emerald-800">
                          <tr>
                            <th className="px-2.5 py-1.5 text-left">หมวด</th>
                            <th className="px-2.5 py-1.5 text-left">รายการ</th>
                            <th className="px-2.5 py-1.5 text-right">จำนวน</th>
                            <th className="px-2.5 py-1.5 text-right">ราคา/หน่วย</th>
                            <th className="px-2.5 py-1.5 text-right">รวม (บาท)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detail.expenses.map((e) => (
                            <tr key={e.id}>
                              <td className="px-2.5 py-1.5">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryColor(e.category) }} />
                                  {e.category || "—"}
                                </span>
                              </td>
                              <td className="px-2.5 py-1.5 text-[#1e1b4b]">{e.item}</td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums">{num(e.quantity).toLocaleString("th-TH")}</td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums">{baht(num(e.unitPrice))}</td>
                              <td className="px-2.5 py-1.5 text-right font-bold tabular-nums">{baht(num(e.amount))}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-emerald-100 bg-emerald-50/40 font-black text-emerald-900">
                            <td className="px-2.5 py-1.5" colSpan={4}>
                              รวมทั้งสิ้น
                            </td>
                            <td className="px-2.5 py-1.5 text-right tabular-nums">{baht(detailTotals.spent)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">ยังไม่มีรายการค่าใช้จ่าย</p>
                  )}
                </FormSection>

                <div className="grid gap-4 lg:grid-cols-2">
                  <FormSection
                    tone="amber"
                    icon="clip"
                    title={`เอกสารแนบ (${detail.attachments.length})`}
                    right={
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-600">
                        <Icon name="plus" className="h-3.5 w-3.5" /> เพิ่มไฟล์
                        <input type="file" multiple accept={DOC_ACCEPT} className="hidden" onChange={(e) => void addDocsToTask(detail.id, e.target.files)} />
                      </label>
                    }
                  >
                    {detail.attachments.length ? (
                      <ul className="space-y-1.5">
                        {detail.attachments.map((d) => (
                          <FileRow
                            key={d.id}
                            name={d.originalName || "ไฟล์แนบ"}
                            mime={d.mimeType}
                            size={d.fileSize}
                            href={d.fileUrl}
                            onRemove={() => void removeAttachment(detail.id, d.id)}
                          />
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-500">ยังไม่มีเอกสารแนบ</p>
                    )}
                  </FormSection>

                  <FormSection
                    tone="pink"
                    icon="photo"
                    title={`รูปภาพ (${detail.photos.length})`}
                    right={
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-pink-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-pink-600">
                        <Icon name="plus" className="h-3.5 w-3.5" /> เพิ่มรูป
                        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => void addPhotosToTask(detail.id, e.target.files)} />
                      </label>
                    }
                  >
                    {detail.photos.length ? (
                      <div className="flex flex-wrap gap-2">
                        {detail.photos.map((p, i) => (
                          <div key={p.id} className="group relative">
                            <CoverStar active={coverPhoto(detail)?.id === p.id} onClick={() => void setCover(detail.id, p.id)} />
                            <button
                              type="button"
                              className={`overflow-hidden rounded-lg border ${coverPhoto(detail)?.id === p.id ? "border-amber-400 ring-2 ring-amber-300" : "border-[#e8e6fc]"}`}
                              onClick={() => {
                                setLightboxTitle(detail.title);
                                setLightboxUrls(detail.photos.map((x) => x.fileUrl));
                                setLightboxIndex(i);
                              }}
                            >
                              <img src={p.fileUrl} alt="" className="h-20 w-20 object-cover" />
                            </button>
                            <button
                              type="button"
                              className="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1.5 text-[10px] text-white opacity-0 group-hover:opacity-100"
                              onClick={() => void removePhoto(detail.id, p.id)}
                              title="ลบรูป"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">ยังไม่มีรูปภาพ</p>
                    )}
                  </FormSection>
                </div>
              </div>
            </ModalFormBody>
            <ModalFormActions>
              <button
                type="button"
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                onClick={() => openEdit(detail)}
              >
                แก้ไข
              </button>
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100" onClick={() => setDetail(null)}>
                ปิด
              </button>
            </ModalFormActions>
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(videoFor)}
        onClose={() => setVideoFor(null)}
        title={
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-red-600 to-rose-500 text-white">
              <Icon name="video" className="h-4 w-4" />
            </span>
            <span className="truncate">{videoFor?.title}</span>
          </span>
        }
        size="wide"
      >
        <ModalFormBody>
          {videoFor && youtubeId(videoFor.youtubeUrl) ? <YouTubePlayer videoId={youtubeId(videoFor.youtubeUrl)!} title={videoFor.title} autoPlay /> : null}
        </ModalFormBody>
      </Modal>

      <PrintA4Table
        columns={[
          { label: "กิจกรรม" },
          { label: "หมวดหมู่" },
          { label: "สถานะ" },
          { label: "เริ่ม" },
          { label: "สิ้นสุด" },
          { label: "สถานที่" },
          { label: "ผู้บันทึก" },
          { label: "ผู้เข้าร่วม" },
          { label: "งบประมาณ" },
          { label: "ค่าใช้จ่าย" },
        ]}
        rows={filteredItems.map((a) => {
          const t = activityTotals(a);
          return [
            a.title,
            a.category?.name || "—",
            statusLabel[a.status],
            formatWhen(a.startsAt),
            formatWhen(a.endsAt),
            a.location || "—",
            a.recordedBy || "—",
            a.participants.length ? `${a.participants.length} คน` : "—",
            t.budget > 0 ? baht(t.budget) : "—",
            t.spent > 0 ? baht(t.spent) : "—",
          ];
        })}
      />
    </div>
  );
}

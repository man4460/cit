import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { fetchAllowanceTemplate, saveAllowanceTemplate, type AllowanceDocKind } from "../lib/allowanceDocs";
import { toolbarLinkBtnClass, toolbarPrimaryBtnClass } from "../lib/uiTokens";

const FIELDS: Record<AllowanceDocKind, { key: "note" | "rules"; label: string; hint: string }[]> = {
  bot: [
    { key: "note", label: "หมายเหตุใต้ตาราง", hint: "พิมพ์ต่อจากตารางรายชื่อ" },
    { key: "rules", label: "อ้างอิงระเบียบ (บรรทัดละ 1 ข้อ)", hint: "ขึ้นเป็นรายการหมายเลข 1, 2, 3… ในเอกสาร" },
  ],
  police: [{ key: "note", label: "หมายเหตุใต้ตาราง", hint: "พิมพ์ต่อจากยอดรวม — เว้นว่างได้" }],
};

/**
 * แก้ข้อความตั้งต้นของเอกสารเบิกเบี้ยเลี้ยง — เก็บในฐานข้อมูล ใช้กับทุกภารกิจที่ยังไม่บันทึกทับ
 * แก้ที่นี่ที่เดียว = ภารกิจใหม่ที่ยังไม่เคยบันทึกจะได้ข้อความนี้ทันที
 */
export function AllowanceTemplateModal({ kind, open, onClose }: { kind: AllowanceDocKind; open: boolean; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErr(null);
    fetchAllowanceTemplate<Record<string, unknown>>(kind)
      .then((res) => {
        const next: Record<string, string> = {};
        for (const f of FIELDS[kind]) {
          const v = res.doc?.[f.key];
          next[f.key] = typeof v === "string" ? v : "";
        }
        setValues(next);
        setSavedAt(res.updatedAt);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "โหลดข้อความตั้งต้นไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [kind, open]);

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const res = await saveAllowanceTemplate<Record<string, string>>(kind, values);
      setSavedAt(res.updatedAt);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="ข้อความตั้งต้น (ใช้กับทุกภารกิจ)" size="form">
      <div className="space-y-4">
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          ข้อความนี้ใช้กับทุกภารกิจที่ยังไม่เคยบันทึกเอกสารของตนเอง — ภารกิจที่บันทึกไปแล้วใช้ข้อความของภารกิจนั้น
          {savedAt ? (
            <>
              {" · "}แก้ล่าสุด {new Date(savedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
            </>
          ) : null}
        </p>

        {loading ? <p className="py-6 text-center text-sm text-slate-500">กำลังโหลด…</p> : null}

        {!loading
          ? FIELDS[kind].map((f) => (
              <label key={f.key} className="block">
                <span className="text-xs font-medium text-slate-600">{f.label}</span>
                <textarea
                  className="mt-1 min-h-[10rem] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0000BF] focus:ring-2 focus:ring-[#0000BF]/15"
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
                <span className="mt-1 block text-[11px] text-slate-400">{f.hint}</span>
              </label>
            ))
          : null}

        {err ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p> : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" className={toolbarLinkBtnClass} onClick={onClose} disabled={saving}>
            ยกเลิก
          </button>
          <button type="button" className={toolbarPrimaryBtnClass} onClick={() => void submit()} disabled={saving || loading}>
            {saving ? "กำลังบันทึก…" : "บันทึกข้อความตั้งต้น"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

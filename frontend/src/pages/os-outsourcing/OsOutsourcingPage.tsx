import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiFormJson, apiJson } from "../../api/client";
import { Modal, ModalFormActions, ModalFormBody, ModalFormSection } from "../../components/Modal";
import { ModuleDocumentsModal } from "../../components/ModuleDocumentsModal";
import { PageHeaderBar } from "../../components/PageHeaderBar";
import { useAuth } from "../../context/AuthContext";
import { MODULE_DOCUMENT_CATEGORIES } from "../../lib/moduleDocumentCategories";
import {
  brandGradientFillClass,
  listCardAccentClass,
  listCardClass,
  mediaUrl,
  toolbarLinkBtnClass,
  toolbarMasterBtnClass,
  toolbarMasterGroupClass,
  toolbarPrimaryBtnClass,
} from "../../lib/uiTokens";
import type { OsAreaGroup, OsContract, OsMonthlyAcceptance } from "../../types";

type ContractForm = {
  vendorName: string;
  contractNo: string;
  title: string;
  startDate: string;
  endDate: string;
  monthlyAmount: string;
  notes: string;
  active: boolean;
};

function emptyContractForm(): ContractForm {
  return {
    vendorName: "",
    contractNo: "",
    title: "",
    startDate: "",
    endDate: "",
    monthlyAmount: "",
    notes: "",
    active: true,
  };
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function fmtMoney(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function currentYearCe() {
  return new Date().getFullYear();
}

function currentBudgetYearBe() {
  return currentYearCe() + 543;
}

function monthLabel(monthYm: string) {
  const [y, m] = monthYm.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("th-TH", { month: "short", year: "numeric" });
}

const MONTH_ACCENTS = [
  { bar: "bg-sky-500", soft: "from-sky-50/90 to-white", border: "border-sky-200/80", chip: "text-sky-800 bg-sky-500/15", glow: "shadow-sky-500/10" },
  { bar: "bg-violet-500", soft: "from-violet-50/90 to-white", border: "border-violet-200/80", chip: "text-violet-800 bg-violet-500/15", glow: "shadow-violet-500/10" },
  { bar: "bg-fuchsia-500", soft: "from-fuchsia-50/90 to-white", border: "border-fuchsia-200/80", chip: "text-fuchsia-800 bg-fuchsia-500/15", glow: "shadow-fuchsia-500/10" },
  { bar: "bg-rose-500", soft: "from-rose-50/90 to-white", border: "border-rose-200/80", chip: "text-rose-800 bg-rose-500/15", glow: "shadow-rose-500/10" },
  { bar: "bg-orange-500", soft: "from-orange-50/90 to-white", border: "border-orange-200/80", chip: "text-orange-800 bg-orange-500/15", glow: "shadow-orange-500/10" },
  { bar: "bg-amber-500", soft: "from-amber-50/90 to-white", border: "border-amber-200/80", chip: "text-amber-900 bg-amber-500/15", glow: "shadow-amber-500/10" },
  { bar: "bg-lime-500", soft: "from-lime-50/90 to-white", border: "border-lime-200/80", chip: "text-lime-900 bg-lime-500/15", glow: "shadow-lime-500/10" },
  { bar: "bg-emerald-500", soft: "from-emerald-50/90 to-white", border: "border-emerald-200/80", chip: "text-emerald-800 bg-emerald-500/15", glow: "shadow-emerald-500/10" },
  { bar: "bg-teal-500", soft: "from-teal-50/90 to-white", border: "border-teal-200/80", chip: "text-teal-800 bg-teal-500/15", glow: "shadow-teal-500/10" },
  { bar: "bg-cyan-500", soft: "from-cyan-50/90 to-white", border: "border-cyan-200/80", chip: "text-cyan-800 bg-cyan-500/15", glow: "shadow-cyan-500/10" },
  { bar: "bg-indigo-500", soft: "from-indigo-50/90 to-white", border: "border-indigo-200/80", chip: "text-indigo-800 bg-indigo-500/15", glow: "shadow-indigo-500/10" },
  { bar: "bg-blue-600", soft: "from-blue-50/90 to-white", border: "border-blue-200/80", chip: "text-blue-800 bg-blue-500/15", glow: "shadow-blue-500/10" },
] as const;

function monthAccent(monthYm: string) {
  const m = Number(monthYm.slice(5, 7));
  return MONTH_ACCENTS[(m - 1 + 12) % 12];
}

function monthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

function monthInRange(monthYm: string, startIso: string, endIso: string) {
  const y = Number(monthYm.slice(0, 4));
  const m = Number(monthYm.slice(5, 7));
  const ms = new Date(y, m - 1, 1).getTime();
  const me = new Date(y, m, 0, 23, 59, 59, 999).getTime();
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return me >= start && ms <= end;
}

export function OsOutsourcingPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [groups, setGroups] = useState<OsAreaGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedContractId, setSelectedContractId] = useState("");
  const [acceptances, setAcceptances] = useState<OsMonthlyAcceptance[]>([]);
  const [yearCe, setYearCe] = useState(currentYearCe);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<OsContract | null>(null);
  const [contractForm, setContractForm] = useState<ContractForm>(emptyContractForm);

  const [acceptModal, setAcceptModal] = useState<{ mode: "create" | "edit"; monthYm: string; id?: string } | null>(
    null,
  );
  const [acceptAmount, setAcceptAmount] = useState("");
  const [acceptRemarks, setAcceptRemarks] = useState("");
  const [acceptFile, setAcceptFile] = useState<File | null>(null);
  const [docUploadingId, setDocUploadingId] = useState<string | null>(null);
  const [contractDocUploading, setContractDocUploading] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const attachTargetIdRef = useRef<string | null>(null);
  const contractAttachInputRef = useRef<HTMLInputElement>(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await apiJson<OsAreaGroup[]>("/api/os-outsourcing/groups");
      setGroups(rows);
      setSelectedGroupId((prev) => prev || rows[0]?.id || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดกลุ่มไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  const contracts = useMemo(() => selectedGroup?.contracts ?? [], [selectedGroup]);

  useEffect(() => {
    if (!selectedGroupId) return;
    const list = groups.find((g) => g.id === selectedGroupId)?.contracts ?? [];
    const still = list.some((c) => c.id === selectedContractId);
    if (!still) setSelectedContractId(list.find((c) => c.active)?.id ?? list[0]?.id ?? "");
  }, [selectedGroupId, groups, selectedContractId]);

  const selectedContract = useMemo(
    () => contracts.find((c) => c.id === selectedContractId) ?? null,
    [contracts, selectedContractId],
  );

  const loadAcceptances = useCallback(async () => {
    if (!selectedContractId) {
      setAcceptances([]);
      return;
    }
    try {
      const rows = await apiJson<OsMonthlyAcceptance[]>(
        `/api/os-outsourcing/contracts/${selectedContractId}/acceptances?year=${yearCe}`,
      );
      setAcceptances(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดตรวจรับไม่สำเร็จ");
    }
  }, [selectedContractId, yearCe]);

  useEffect(() => {
    void loadAcceptances();
  }, [loadAcceptances]);

  const acceptanceByMonth = useMemo(() => {
    const map = new Map<string, OsMonthlyAcceptance>();
    for (const a of acceptances) map.set(a.monthYm, a);
    return map;
  }, [acceptances]);

  function openCreateContract() {
    if (!selectedGroupId) {
      setErr("เลือกกลุ่มก่อน");
      return;
    }
    setEditingContract(null);
    setContractForm(emptyContractForm());
    setContractModalOpen(true);
    setErr(null);
  }

  function openEditContract(c: OsContract) {
    setEditingContract(c);
    setContractForm({
      vendorName: c.vendorName,
      contractNo: c.contractNo ?? "",
      title: c.title ?? "",
      startDate: toDateInput(c.startDate),
      endDate: toDateInput(c.endDate),
      monthlyAmount: c.monthlyAmount != null ? String(c.monthlyAmount) : "",
      notes: c.notes ?? "",
      active: c.active,
    });
    setContractModalOpen(true);
    setErr(null);
  }

  async function submitContract(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGroupId) return;
    const vendorName = contractForm.vendorName.trim();
    if (!vendorName) {
      setErr("กรอกชื่อผู้รับจ้าง");
      return;
    }
    if (!contractForm.startDate || !contractForm.endDate) {
      setErr("ระบุวันเริ่มและสิ้นสุดสัญญา");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body = {
        areaGroupId: selectedGroupId,
        vendorName,
        contractNo: contractForm.contractNo.trim() || null,
        title: contractForm.title.trim() || null,
        startDate: contractForm.startDate,
        endDate: contractForm.endDate,
        monthlyAmount: contractForm.monthlyAmount.trim() === "" ? null : Number(contractForm.monthlyAmount),
        notes: contractForm.notes.trim() || null,
        active: contractForm.active,
      };
      if (editingContract) {
        await apiJson(`/api/os-outsourcing/contracts/${editingContract.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        const created = await apiJson<OsContract>("/api/os-outsourcing/contracts", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setSelectedContractId(created.id);
      }
      setContractModalOpen(false);
      await loadGroups();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "บันทึกสัญญาไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function removeContract(c: OsContract) {
    if (!confirm(`ลบสัญญา «${c.vendorName}» ? รายการตรวจรับและยอดหักงบที่ผูกจะถูกลบด้วย`)) return;
    setErr(null);
    try {
      await apiJson(`/api/os-outsourcing/contracts/${c.id}`, { method: "DELETE" });
      if (selectedContractId === c.id) setSelectedContractId("");
      await loadGroups();
      await loadAcceptances();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "ลบสัญญาไม่สำเร็จ");
    }
  }

  function openAccept(monthYm: string) {
    if (!isAdmin) {
      setErr("การตรวจรับที่หักงบต้องเป็นผู้ดูแลระบบ");
      return;
    }
    if (!selectedContract) return;
    setAcceptModal({ mode: "create", monthYm });
    setAcceptAmount(selectedContract.monthlyAmount != null ? String(selectedContract.monthlyAmount) : "");
    setAcceptRemarks("");
    setAcceptFile(null);
    setErr(null);
  }

  function openEditAccept(a: OsMonthlyAcceptance) {
    if (!isAdmin) {
      setErr("แก้ไขตรวจรับต้องเป็นผู้ดูแลระบบ");
      return;
    }
    setAcceptModal({ mode: "edit", monthYm: a.monthYm, id: a.id });
    setAcceptAmount(String(a.acceptedAmount));
    setAcceptRemarks(a.remarks ?? "");
    setAcceptFile(null);
    setErr(null);
  }

  async function submitAccept(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedContractId || !acceptModal) return;
    const amount = Number(acceptAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setErr("ยอดตรวจรับไม่ถูกต้อง");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (acceptModal.mode === "edit" && acceptModal.id) {
        await apiJson(`/api/os-outsourcing/acceptances/${acceptModal.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            acceptedAmount: amount,
            remarks: acceptRemarks.trim() || null,
          }),
        });
      } else {
        const fd = new FormData();
        fd.append("monthYm", acceptModal.monthYm);
        fd.append("acceptedAmount", String(amount));
        if (acceptRemarks.trim()) fd.append("remarks", acceptRemarks.trim());
        if (acceptFile) fd.append("file", acceptFile);
        await apiFormJson(`/api/os-outsourcing/contracts/${selectedContractId}/acceptances`, fd);
      }
      setAcceptModal(null);
      setAcceptFile(null);
      await loadAcceptances();
      await loadGroups();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : acceptModal.mode === "edit" ? "แก้ไขไม่สำเร็จ" : "ตรวจรับไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function revokeAccept(a: OsMonthlyAcceptance) {
    if (!isAdmin) {
      setErr("การยกเลิกตรวจรับต้องเป็นผู้ดูแลระบบ");
      return;
    }
    if (!confirm(`ยกเลิกตรวจรับ ${monthLabel(a.monthYm)} และคืนยอดหักงบ?`)) return;
    setErr(null);
    try {
      await apiJson(`/api/os-outsourcing/acceptances/${a.id}`, { method: "DELETE" });
      await loadAcceptances();
      await loadGroups();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "ยกเลิกไม่สำเร็จ");
    }
  }

  function pickAttachDoc(acceptanceId: string) {
    if (!isAdmin) {
      setErr("แนบเอกสารตรวจรับต้องเป็นผู้ดูแลระบบ");
      return;
    }
    attachTargetIdRef.current = acceptanceId;
    attachInputRef.current?.click();
  }

  async function onAttachFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const acceptanceId = attachTargetIdRef.current;
    e.target.value = "";
    attachTargetIdRef.current = null;
    if (!file || !acceptanceId) return;
    setDocUploadingId(acceptanceId);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const updated = await apiFormJson<OsMonthlyAcceptance>(
        `/api/os-outsourcing/acceptances/${acceptanceId}/documents`,
        fd,
      );
      setAcceptances((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "แนบเอกสารไม่สำเร็จ");
    } finally {
      setDocUploadingId(null);
    }
  }

  async function removeAcceptanceDoc(acceptanceId: string, linkId: string, title: string) {
    if (!isAdmin) return;
    if (!confirm(`ลบเอกสาร «${title}» จากตรวจรับและคลังเอกสาร?`)) return;
    setErr(null);
    try {
      const updated = await apiJson<OsMonthlyAcceptance>(
        `/api/os-outsourcing/acceptances/${acceptanceId}/documents/${linkId}`,
        { method: "DELETE" },
      );
      setAcceptances((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "ลบเอกสารไม่สำเร็จ");
    }
  }

  function pickContractAttachDoc() {
    if (!isAdmin) {
      setErr("แนบเอกสารสัญญาต้องเป็นผู้ดูแลระบบ");
      return;
    }
    if (!selectedContractId) return;
    contractAttachInputRef.current?.click();
  }

  async function onContractAttachFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedContractId) return;
    setContractDocUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiFormJson<OsContract>(`/api/os-outsourcing/contracts/${selectedContractId}/documents`, fd);
      await loadGroups();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "แนบเอกสารสัญญาไม่สำเร็จ");
    } finally {
      setContractDocUploading(false);
    }
  }

  async function removeContractDoc(linkId: string, title: string) {
    if (!isAdmin || !selectedContractId) return;
    if (!confirm(`ลบเอกสาร «${title}» จากสัญญาและคลังเอกสาร?`)) return;
    setErr(null);
    try {
      await apiJson<OsContract>(`/api/os-outsourcing/contracts/${selectedContractId}/documents/${linkId}`, {
        method: "DELETE",
      });
      await loadGroups();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "ลบเอกสารสัญญาไม่สำเร็จ");
    }
  }

  const budgetYearBe = currentBudgetYearBe();

  return (
    <div>
      <PageHeaderBar
        title="งานจ้าง OS"
        count={groups.length}
        filter={{
          value: "",
          onChange: () => {},
          showSearch: false,
          printTitle: "งานจ้าง OS — ตรวจรับรายเดือน",
        }}
        segments={
          <div className={toolbarMasterGroupClass}>
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`${toolbarMasterBtnClass} ${selectedGroupId === g.id ? "bg-[#0000BF]/10" : ""}`}
                onClick={() => setSelectedGroupId(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>
        }
        extras={
          <>
            <Link to={`/budget/year/${budgetYearBe}`} className={toolbarLinkBtnClass}>
              งบประมาณ {budgetYearBe}
            </Link>
            <button type="button" className={toolbarLinkBtnClass} onClick={() => setDocsOpen(true)}>
              เอกสาร
            </button>
          </>
        }
        primary={
          <button type="button" className={toolbarPrimaryBtnClass} onClick={openCreateContract}>
            เพิ่มสัญญา
          </button>
        }
      />

      <ModuleDocumentsModal
        open={docsOpen}
        onClose={() => setDocsOpen(false)}
        categoryName={MODULE_DOCUMENT_CATEGORIES.osOutsourcing}
      />

      {err ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-center text-sm text-slate-600">กำลังโหลด…</p>
      ) : !selectedGroup ? (
        <p className="mt-6 text-center text-sm text-slate-600">ยังไม่มีกลุ่มพื้นที่</p>
      ) : (
        <>
          <section className={`${listCardClass} mt-4 p-4`}>
            <span className={`absolute inset-y-0 left-0 w-1.5 ${listCardAccentClass(0)}`} aria-hidden />
            <div className="pl-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-[#0000BF]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#0000BF]">
                      {selectedGroup.code}
                    </span>
                    <h2 className="text-sm font-black text-[#1e1b4b]">{selectedGroup.name}</h2>
                    {selectedContract?.active ? (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        ใช้งาน
                      </span>
                    ) : selectedContract ? (
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                        ปิด
                      </span>
                    ) : null}
                    {selectedContract?.contractNo ? (
                      <span className="font-mono text-[10px] text-slate-500">{selectedContract.contractNo}</span>
                    ) : null}
                  </div>

                  {selectedContract ? (
                    <>
                      <p className="mt-1.5 text-sm font-semibold leading-snug text-[#1e1b3a]">
                        {selectedContract.vendorName}
                      </p>
                      {selectedContract.title ? (
                        <p className="mt-0.5 text-[12px] text-slate-600">{selectedContract.title}</p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-slate-600">
                        สัญญา {fmtDate(selectedContract.startDate)} – {fmtDate(selectedContract.endDate)}
                        <span className="text-slate-400"> · </span>
                        รายเดือน {fmtMoney(selectedContract.monthlyAmount)} บาท
                        {selectedContract._count
                          ? ` · ตรวจรับ ${selectedContract._count.acceptances} เดือน`
                          : ""}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1.5 text-[12px] text-amber-800">ยังไม่มีสัญญาในกลุ่มนี้ — กด «เพิ่มสัญญา»</p>
                  )}

                  <p className="mt-2 text-[11px] text-slate-600">
                    บัญชีงบ:{" "}
                    {selectedGroup.budgetAccount ? (
                      <span className="font-semibold text-emerald-800">{selectedGroup.budgetAccount.name}</span>
                    ) : (
                      <span className="font-semibold text-amber-800">ยังไม่ผูกบัญชี</span>
                    )}
                    <span className="text-slate-400"> · </span>
                    หมวดค่าจ้างงานรักษาความปลอดภัย
                  </p>

                  {selectedContract ? (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">เอกสารสัญญา</p>
                        <button
                          type="button"
                          className="text-[10px] font-bold text-[#0000BF] hover:underline"
                          onClick={() => setDocsOpen(true)}
                        >
                          เปิดคลังเอกสาร
                        </button>
                      </div>
                      <input
                        ref={contractAttachInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf"
                        onChange={(e) => void onContractAttachFileSelected(e)}
                      />
                      {(selectedContract.documents ?? []).length ? (
                        (selectedContract.documents ?? []).map((d) => {
                          const href = mediaUrl(d.fileUrl);
                          return (
                            <div
                              key={d.id}
                              className="flex items-center gap-1.5 rounded-lg border border-[#ecebff] bg-white/90 px-2 py-1.5"
                            >
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#0000BF]/10 text-[10px] font-black text-[#0000BF]">
                                ไฟล์
                              </span>
                              {href ? (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#0000BF] hover:underline"
                                  title={d.title}
                                >
                                  {d.title}
                                </a>
                              ) : (
                                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600">{d.title}</span>
                              )}
                              {isAdmin ? (
                                <button
                                  type="button"
                                  className="shrink-0 text-[10px] font-bold text-rose-600 hover:underline"
                                  onClick={() => void removeContractDoc(d.id, d.title)}
                                >
                                  ลบ
                                </button>
                              ) : null}
                            </div>
                          );
                        })
                      ) : (
                        <p className="rounded-lg border border-dashed border-[#dcd8f0] bg-[#faf9ff]/80 px-2 py-2 text-center text-[10px] text-slate-400">
                          ยังไม่มีเอกสารสัญญา
                        </p>
                      )}
                      {isAdmin ? (
                        <button
                          type="button"
                          disabled={contractDocUploading}
                          className="rounded-full border border-[#0000BF]/20 bg-[#0000BF]/8 px-2.5 py-1 text-[11px] font-bold text-[#0000BF] hover:bg-[#0000BF]/12 disabled:opacity-40"
                          onClick={pickContractAttachDoc}
                        >
                          {contractDocUploading ? "กำลังอัปโหลด…" : "แนบเอกสารสัญญา"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  {contracts.length > 1 ? (
                    <select
                      aria-label="เลือกสัญญา"
                      className="max-w-[14rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800"
                      value={selectedContractId}
                      onChange={(e) => setSelectedContractId(e.target.value)}
                    >
                      {contracts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.contractNo ? `${c.contractNo} · ` : ""}
                          {c.vendorName}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {selectedContract ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                        onClick={() => openEditContract(selectedContract)}
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
                        onClick={() => void removeContract(selectedContract)}
                      >
                        ลบ
                      </button>
                    </div>
                  ) : null}
                  {!isAdmin ? (
                    <p className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
                      ตรวจรับหักงบ: เฉพาะ ADMIN
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {selectedContract ? (
            <section className="mt-4 overflow-hidden rounded-[1.25rem] border border-[#e8e6fc] bg-gradient-to-br from-white via-[#faf9ff] to-[#f3f0ff]/80 shadow-sm shadow-[#0000BF]/[0.04]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ecebff] bg-white/70 px-4 py-3 backdrop-blur-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-black text-[#1e1b4b]">ตรวจรับรายเดือน</h2>
                  <span className="rounded-full bg-[#0000BF]/8 px-2 py-0.5 text-[10px] font-bold tabular-nums text-[#0000BF]">
                    {yearCe + 543}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={toolbarLinkBtnClass}
                    onClick={() => setDocsOpen(true)}
                  >
                    คลังเอกสาร
                  </button>
                  <div className={toolbarMasterGroupClass}>
                    <button
                      type="button"
                      className={toolbarMasterBtnClass}
                      onClick={() => setYearCe((y) => y - 1)}
                    >
                      ←
                    </button>
                    <span className={`${toolbarMasterBtnClass} min-w-[4.5rem] justify-center font-bold`}>
                      {yearCe + 543}
                    </span>
                    <button
                      type="button"
                      className={toolbarMasterBtnClass}
                      onClick={() => setYearCe((y) => y + 1)}
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>

              <input
                ref={attachInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf"
                onChange={(e) => void onAttachFileSelected(e)}
              />

              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {monthsOfYear(yearCe).map((monthYm) => {
                  const inRange = monthInRange(monthYm, selectedContract.startDate, selectedContract.endDate);
                  const row = acceptanceByMonth.get(monthYm);
                  const docs = row?.documents ?? [];
                  const accent = monthAccent(monthYm);
                  const amountDisplay = row
                    ? fmtMoney(row.acceptedAmount)
                    : inRange
                      ? fmtMoney(selectedContract.monthlyAmount)
                      : "—";

                  return (
                    <article
                      key={monthYm}
                      className={`relative overflow-hidden rounded-2xl border p-3.5 shadow-sm transition ${
                        !inRange
                          ? "border-slate-200/80 bg-gradient-to-br from-slate-100/90 to-slate-50 opacity-75"
                          : row
                            ? `${accent.border} bg-gradient-to-br ${accent.soft} ${accent.glow}`
                            : `${accent.border} bg-gradient-to-br ${accent.soft} hover:-translate-y-0.5 hover:shadow-md ${accent.glow}`
                      }`}
                    >
                      <span className={`absolute inset-y-0 left-0 w-1.5 ${inRange ? accent.bar : "bg-slate-300"}`} aria-hidden />
                      <div className="pl-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-black text-[#1e1b4b]">{monthLabel(monthYm)}</p>
                            <p className="mt-0.5 text-[10px] font-mono text-slate-400">{monthYm}</p>
                          </div>
                          {!inRange ? (
                            <span className="rounded-full bg-slate-300/70 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                              นอกสัญญา
                            </span>
                          ) : row ? (
                            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm shadow-emerald-500/30">
                              ตรวจรับแล้ว
                            </span>
                          ) : (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${accent.chip}`}>
                              รอตรวจรับ
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex items-end justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">ยอด (บาท)</p>
                            <p className="mt-0.5 text-base font-black tabular-nums text-[#1e1b4b]">{amountDisplay}</p>
                            {row?.remarks ? (
                              <p className="mt-1 line-clamp-2 text-[10px] text-slate-500">{row.remarks}</p>
                            ) : null}
                          </div>
                          {row?.budgetTransactionId ? (
                            <span className="rounded-md bg-[#0000BF] px-1.5 py-0.5 text-[10px] font-bold text-white">
                              หักงบแล้ว
                            </span>
                          ) : null}
                        </div>

                        {inRange && row ? (
                          <div className="mt-3 space-y-1.5">
                            {docs.length ? (
                              docs.map((d) => {
                                const href = mediaUrl(d.fileUrl);
                                return (
                                  <div
                                    key={d.id}
                                    className="flex items-center gap-1.5 rounded-lg border border-white/80 bg-white/90 px-2 py-1.5 shadow-sm"
                                  >
                                    <span
                                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-black text-white ${accent.bar}`}
                                    >
                                      ไฟล์
                                    </span>
                                    {href ? (
                                      <a
                                        href={href}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#0000BF] hover:underline"
                                        title={d.title}
                                      >
                                        {d.title}
                                      </a>
                                    ) : (
                                      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600">{d.title}</span>
                                    )}
                                    {isAdmin ? (
                                      <button
                                        type="button"
                                        className="shrink-0 text-[10px] font-bold text-rose-600 hover:underline"
                                        onClick={() => void removeAcceptanceDoc(row.id, d.id, d.title)}
                                      >
                                        ลบ
                                      </button>
                                    ) : null}
                                  </div>
                                );
                              })
                            ) : (
                              <p className="rounded-lg border border-dashed border-white/70 bg-white/40 px-2 py-2 text-center text-[10px] text-slate-500">
                                ยังไม่มีเอกสารตรวจรับ
                              </p>
                            )}
                          </div>
                        ) : null}

                        {inRange ? (
                          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-black/5 pt-3">
                            {row ? (
                              <>
                                <button
                                  type="button"
                                  disabled={!isAdmin}
                                  className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-40"
                                  onClick={() => openEditAccept(row)}
                                >
                                  แก้ไข
                                </button>
                                <button
                                  type="button"
                                  disabled={!isAdmin || docUploadingId === row.id}
                                  className="rounded-full border border-[#0000BF]/20 bg-[#0000BF]/8 px-2.5 py-1 text-[11px] font-bold text-[#0000BF] hover:bg-[#0000BF]/12 disabled:opacity-40"
                                  onClick={() => pickAttachDoc(row.id)}
                                >
                                  {docUploadingId === row.id ? "กำลังอัปโหลด…" : "แนบเอกสาร"}
                                </button>
                                <button
                                  type="button"
                                  disabled={!isAdmin}
                                  className="rounded-full px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                                  onClick={() => void revokeAccept(row)}
                                >
                                  ยกเลิก
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={!isAdmin}
                                className={`rounded-full px-3 py-1 text-[11px] font-bold text-white disabled:opacity-40 ${brandGradientFillClass}`}
                                onClick={() => openAccept(monthYm)}
                              >
                                ตรวจรับ
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      )}

      <Modal
        open={contractModalOpen}
        onClose={() => !saving && setContractModalOpen(false)}
        title={editingContract ? "แก้ไขสัญญา" : "เพิ่มสัญญา"}
        size="wide"
      >
        <form onSubmit={(e) => void submitContract(e)}>
          <ModalFormBody>
            {err && contractModalOpen ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
            ) : null}
            <ModalFormSection title="ข้อมูลสัญญา">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">
                    ผู้รับจ้าง / บริษัท <span className="text-rose-500">*</span>
                  </span>
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={contractForm.vendorName}
                    onChange={(e) => setContractForm((f) => ({ ...f, vendorName: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">เลขสัญญา</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={contractForm.contractNo}
                    onChange={(e) => setContractForm((f) => ({ ...f, contractNo: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ชื่อสัญญา / รายการ</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={contractForm.title}
                    onChange={(e) => setContractForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">
                    วันเริ่ม <span className="text-rose-500">*</span>
                  </span>
                  <input
                    required
                    type="date"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={contractForm.startDate}
                    onChange={(e) => setContractForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">
                    วันสิ้นสุด <span className="text-rose-500">*</span>
                  </span>
                  <input
                    required
                    type="date"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={contractForm.endDate}
                    onChange={(e) => setContractForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">ยอดตรวจรับรายเดือน (บาท)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={contractForm.monthlyAmount}
                    onChange={(e) => setContractForm((f) => ({ ...f, monthlyAmount: e.target.value }))}
                  />
                </label>
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={contractForm.active}
                    onChange={(e) => setContractForm((f) => ({ ...f, active: e.target.checked }))}
                  />
                  <span className="text-xs font-medium text-slate-700">สัญญาใช้งานอยู่</span>
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">หมายเหตุ</span>
                  <textarea
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    value={contractForm.notes}
                    onChange={(e) => setContractForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </label>
              </div>
            </ModalFormSection>
          </ModalFormBody>
          <ModalFormActions>
            <button
              type="submit"
              disabled={saving}
              className={`rounded-full px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 disabled:opacity-50 ${brandGradientFillClass}`}
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => setContractModalOpen(false)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>

      <Modal
        open={Boolean(acceptModal)}
        onClose={() => !saving && setAcceptModal(null)}
        title={
          acceptModal
            ? `${acceptModal.mode === "edit" ? "แก้ไขตรวจรับ" : "ตรวจรับ"} · ${monthLabel(acceptModal.monthYm)}`
            : "ตรวจรับ"
        }
      >
        <form onSubmit={(e) => void submitAccept(e)}>
          <ModalFormBody>
            {err && acceptModal ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
            ) : null}
            <label className="block">
              <span className="text-xs font-medium text-slate-700">ยอดตรวจรับ (บาท)</span>
              <input
                required
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={acceptAmount}
                onChange={(e) => setAcceptAmount(e.target.value)}
              />
            </label>
            {acceptModal?.mode === "create" ? (
              <label className="mt-3 block">
                <span className="text-xs font-medium text-slate-700">เอกสารตรวจรับ (คลัง «งานจ้าง OS»)</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf"
                  className="mt-1 w-full rounded-lg border border-dashed border-[#dcd8f0] bg-[#faf9ff] px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-[#0000BF]/10 file:px-3 file:py-1 file:text-[11px] file:font-bold file:text-[#0000BF]"
                  onChange={(e) => setAcceptFile(e.target.files?.[0] ?? null)}
                />
                {acceptFile ? (
                  <p className="mt-1 truncate text-[11px] text-slate-500">{acceptFile.name}</p>
                ) : null}
              </label>
            ) : null}
            <label className="mt-3 block">
              <span className="text-xs font-medium text-slate-700">หมายเหตุ</span>
              <textarea
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900"
                value={acceptRemarks}
                onChange={(e) => setAcceptRemarks(e.target.value)}
              />
            </label>
          </ModalFormBody>
          <ModalFormActions>
            <button
              type="submit"
              disabled={saving}
              className={`rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${brandGradientFillClass}`}
            >
              {saving ? "กำลังบันทึก…" : acceptModal?.mode === "edit" ? "บันทึกการแก้ไข" : "ยืนยันตรวจรับ"}
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => setAcceptModal(null)}
            >
              ยกเลิก
            </button>
          </ModalFormActions>
        </form>
      </Modal>
    </div>
  );
}

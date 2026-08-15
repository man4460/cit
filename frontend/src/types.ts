export type MissionStatus = "DRAFT" | "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface PersonnelCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface OrganizationUnitType {
  id: string;
  name: string;
  sortOrder: number;
}

export interface PersonnelBeneficiary {
  id: string;
  fullName: string;
  relationship: string | null;
  phone: string | null;
  idNumber: string | null;
  sortOrder: number;
}

export type TrainingResultStatus = "PASSED" | "FAILED";

export interface TrainingCourse {
  id: string;
  name: string;
  sortOrder: number;
}

export interface DocumentType {
  id: string;
  name: string;
  sortOrder: number;
}

export interface LibraryDocument {
  id: string;
  title: string;
  details: string;
  documentTypeId: string | null;
  documentType: DocumentType | null;
  fileUrl: string | null;
  mimeType: string | null;
  originalName: string | null;
  extractedText?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingEnrollment {
  id: string;
  personnelId: string;
  trainingCourseId: string;
  trainingStartDate: string;
  trainingEndDate: string;
  status: TrainingResultStatus;
  createdAt?: string;
  updatedAt?: string;
  personnel: Personnel;
  trainingCourse: TrainingCourse;
}

export interface Personnel {
  id: string;
  photoUrl: string | null;
  fullName: string;
  idNumber: string;
  employeeCode?: string | null;
  rank: string | null;
  position: string | null;
  phone: string | null;
  gradeLevel?: string | null;
  perDiemRate?: number | string | null;
  vehicleTravelAllowance?: number | string | null;
  policeStationId?: string | null;
  policeStation?: { id: string; name: string; vendorCode?: string | null } | null;
  personnelCategoryId: string | null;
  personnelCategory: PersonnelCategory | null;
  organizationUnitTypeId: string | null;
  organizationUnitType: OrganizationUnitType | null;
  insuranceCompany: string | null;
  insurancePolicyNumber: string | null;
  insuranceExpiry: string | null;
  insuranceNotes: string | null;
  remarks: string | null;
  beneficiaries?: PersonnelBeneficiary[];
}

export interface VehicleType {
  id: string;
  name: string;
  sortOrder: number;
}

export interface WorkCategoryGroup {
  id: string;
  name: string;
  sortOrder: number;
}

export interface VehicleStatus {
  id: string;
  name: string;
  sortOrder: number;
  /** true = ไม่นับในยอดตรวจ/ดูแล (จำหน่าย ส่งคืน ฯลฯ) */
  excludesFromFleetCare?: boolean;
}

export type VehicleAttachmentKind = "PHOTO" | "DOCUMENT";

export interface VehicleDocument {
  id: string;
  vehicleId: string;
  fileUrl: string;
  mimeType: string | null;
  originalName: string | null;
  kind: VehicleAttachmentKind;
  sortOrder: number;
  createdAt: string;
}

/** ผลตรวจแต่ละหัวข้อ — ปกติ / ผิดปกติ */
export type VehicleWeeklyCheckResult = "NORMAL" | "ABNORMAL";

export interface VehicleWeeklyInspection {
  id: string;
  vehicleId: string;
  inspectionDate: string;
  airConditioning: VehicleWeeklyCheckResult | null;
  engineOperation: VehicleWeeklyCheckResult | null;
  tireCondition: VehicleWeeklyCheckResult | null;
  cctvAnalog: VehicleWeeklyCheckResult | null;
  cctvThinkware: VehicleWeeklyCheckResult | null;
  engineStart5Min: VehicleWeeklyCheckResult | null;
  remarks: string | null;
  /** ชื่อผู้ตรวจ (อาจว่าง) */
  inspectorName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleWeeklyInspectionMatrixVehicle {
  id: string;
  licensePlate: string;
  brandModel: string;
  brand: string;
  model: string;
}

export interface VehicleWeeklyInspectionMatrixRow {
  vehicle: VehicleWeeklyInspectionMatrixVehicle;
  inspection: VehicleWeeklyInspection | null;
}

export interface VehicleWeeklyInspectionMatrixResponse {
  weekStart: string;
  inspectionDate: string;
  rows: VehicleWeeklyInspectionMatrixRow[];
}

/** รายงานรถที่บันทึกการตรวจแล้วในสัปดาห์อ้างอิง */
export interface VehicleWeeklyInspectionReportResponse {
  weekStart: string;
  inspectionDate: string;
  totalVehicles: number;
  inspectedCount: number;
  rows: Array<VehicleWeeklyInspection & { vehicle: VehicleWeeklyInspectionMatrixVehicle }>;
}

export interface Vehicle {
  id: string;
  brandModel: string;
  brand: string;
  model: string;
  licensePlate: string;
  assetCode: string | null;
  chassisNumber: string | null;
  engineNumber: string | null;
  color: string | null;
  vehicleTypeId: string | null;
  vehicleType: VehicleType | null;
  workCategoryGroupId: string | null;
  workCategoryGroup: WorkCategoryGroup | null;
  vehicleStatusId: string | null;
  vehicleStatus: VehicleStatus | null;
  notes: string | null;
  /** วันจัดซื้อ (ISO) — ใช้คำนวณอายุรถ */
  purchasedAt: string | null;
  currentMileage: string;
  documents?: VehicleDocument[];
  _count?: { documents: number; maintenanceLogs: number; fuelLogs: number };
}

export interface MaintenanceLog {
  id: string;
  vehicleId: string;
  date: string;
  detail: string;
  cost: string;
  createdAt: string;
}

export interface VehicleDetail extends Vehicle {
  maintenanceLogs: MaintenanceLog[];
}

/** ชื่อแสดงผล: ยี่ห้อ + รุ่น หรือ fallback brandModel */
export function vehicleDisplayLabel(v: Pick<Vehicle, "brand" | "model" | "brandModel">) {
  const s = [(v.brand ?? "").trim(), (v.model ?? "").trim()].filter(Boolean).join(" ").trim();
  return s || v.brandModel;
}

export type RouteMasterStatus = "ACTIVE" | "INACTIVE";

export interface RouteMaster {
  id: string;
  name: string | null;
  startLocation: string;
  endLocation: string;
  distanceKm: string;
  /** ค่าตอบแทนบุคคลภายนอกมาตรฐาน (บาท) */
  externalPersonnelCompensation?: string | null;
  /** จำนวนวันภารกิจมาตรฐาน */
  missionDays?: number | null;
  /** ACTIVE = ใช้งาน, INACTIVE = เลิกใช้ */
  status?: RouteMasterStatus;
}

export interface FireExtinguisher {
  id: string;
  code: string;
  location: string;
  kind: string;
  sizeLabel: string;
  manufacturedAt: string | null;
  status: string;
  guardTeam: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FireHost {
  id: string;
  code: string;
  detail: string;
  location: string;
  guardTeam: string | null;
  track: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BulletproofVest {
  id: string;
  code: string;
  description: string;
  level: string;
  team: string | null;
  capturedAt: string | null;
  costCenter: string | null;
  registerNo: string | null;
  permitBeginsAt: string | null;
  permitExpiresAt: string | null;
  notes: string | null;
  docUrl: string | null;
  mailUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Firearm {
  id: string;
  code: string;
  costCenter: string | null;
  brand: string;
  serial: string | null;
  registerNo: string | null;
  registerCard: string | null;
  purchasedAt: string | null;
  detail: string | null;
  team: string | null;
  docUrl: string | null;
  photoUrl: string | null;
  status: string;
  checked: string | null;
  fixNote: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AmmoMove {
  id: string;
  ammunitionId: string;
  kind: "IN" | "OUT";
  quantity: number;
  movedAt: string;
  withdrawnBy: string | null;
  note: string | null;
  remainingAfter: number;
  createdAt: string;
}

export interface Ammunition {
  id: string;
  sourceKey: string;
  code: string;
  kind: string;
  purchasedAt: string | null;
  team: string | null;
  detail: string | null;
  receivedQty: number;
  remainingQty: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  moves?: AmmoMove[];
}

export interface NameMasterRow {
  id: string;
  name: string;
  sortOrder: number;
  excludesFromFleetCare?: boolean;
  /** หมวดคดีสืบสวน: STRATEGIC | BAU */
  kind?: "STRATEGIC" | "BAU" | string;
  /** แฟ้มคดีสืบสวน: รหัสแฟ้ม / ขอบเขต / ทีมเจ้าของ */
  code?: string | null;
  description?: string | null;
  teamId?: string | null;
  team?: { id: string; name: string; code: string | null } | null;
}

export type InvestigationCategoryKind = "STRATEGIC" | "BAU";

export interface InvestigationCategory {
  id: string;
  name: string;
  /** ชื่อรองภาษาอังกฤษ */
  nameEn: string | null;
  /** รหัสแฟ้มคดี เช่น FILE-1 (เฉพาะแฟ้มหลัก) */
  code: string | null;
  /** ขอบเขตของแฟ้ม — เก็บเอกสารประเภทใดบ้าง */
  description: string | null;
  kind: InvestigationCategoryKind;
  /** ทีมแนะนำ (ไม่บังคับ) */
  teamId: string | null;
  team?: { id: string; name: string; code: string | null; sortOrder: number } | null;
  /** null = แฟ้มหลัก */
  parentId?: string | null;
  children?: InvestigationCategory[];
  _count?: { cases?: number; children?: number; subCases?: number };
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type InvestigationCaseStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "OPEN"
  | "IN_PROGRESS"
  | "PENDING_EXTERNAL"
  | "REPORT_SUBMITTED"
  | "CLOSED"
  | "ARCHIVED"
  | "REJECTED";

/** ตำแหน่งตามสายงานสืบสวน เรียงลำดับการเสนอจากล่างขึ้นบน */
export type InvestigationOrgRole =
  | "INVESTIGATOR"
  | "ASSISTANT_DIRECTOR"
  | "DEPUTY_DIRECTOR"
  | "DIRECTOR";

export type InvestigationApprovalStage = "CASE_OPEN" | "FINAL_REPORT";
export type InvestigationApprovalDecision = "PENDING" | "APPROVED" | "REJECTED";
export type InvestigationIssueStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "DROPPED";
export type InvestigationDocumentKind = "EVIDENCE" | "REPORT" | "ATTACHMENT";

export interface InvestigationTeam {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  sortOrder: number;
  active: boolean;
  leadMemberId: string | null;
  members?: InvestigationMember[];
  createdAt: string;
  updatedAt: string;
}

export interface InvestigationMember {
  id: string;
  teamId: string | null;
  team?: InvestigationTeam | null;
  userId: string | null;
  personnelId: string | null;
  fullName: string;
  position: string | null;
  orgRole: InvestigationOrgRole;
  approvalLevel: number;
  email: string | null;
  phone: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvestigationIssue {
  id: string;
  caseId: string;
  title: string;
  detail: string | null;
  status: InvestigationIssueStatus;
  assigneeMemberId: string | null;
  assignee?: InvestigationMember | null;
  dueAt: string | null;
  finding: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvestigationDocument {
  id: string;
  caseId: string;
  issueId: string | null;
  storedFilename: string;
  fileUrl: string;
  originalName: string | null;
  mimeType: string | null;
  kind: InvestigationDocumentKind;
  title: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface InvestigationApproval {
  id: string;
  caseId: string;
  case?: InvestigationCase | null;
  stage: InvestigationApprovalStage;
  sequence: number;
  approverMemberId: string | null;
  approver?: InvestigationMember | null;
  approverName: string | null;
  approverEmail: string | null;
  orgRole: InvestigationOrgRole;
  decision: InvestigationApprovalDecision;
  comment: string | null;
  decidedAt: string | null;
  tokenExpiresAt: string | null;
  notifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvestigationCaseEvent {
  id: string;
  caseId: string;
  type: string;
  message: string;
  actorUserId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface InvestigationCase {
  id: string;
  caseNumber: string;
  title: string;
  summary: string | null;
  categoryId: string;
  category?: InvestigationCategory | null;
  subCategoryId: string | null;
  subCategory?: InvestigationCategory | null;
  teamId: string | null;
  team?: InvestigationTeam | null;
  leadMemberId: string | null;
  leadMember?: InvestigationMember | null;
  requestedByMemberId: string | null;
  requestedByMember?: InvestigationMember | null;
  status: InvestigationCaseStatus;
  priority: number;
  slaDueAt: string | null;
  openedAt: string;
  closedAt: string | null;
  ownerUserId: string | null;
  tags: string | null;
  approvalStage: InvestigationApprovalStage | null;
  conclusion: string | null;
  recommendation: string | null;
  reportSubmittedAt: string | null;
  approvedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvestigationCaseDetail extends InvestigationCase {
  issues: InvestigationIssue[];
  documents: InvestigationDocument[];
  approvals: InvestigationApproval[];
  events: InvestigationCaseEvent[];
}

export interface InvestigationStats {
  total: number;
  draft: number;
  pendingApproval: number;
  open: number;
  inProgress: number;
  pendingExternal: number;
  reportSubmitted: number;
  closed: number;
  archived: number;
  rejected: number;
  active: number;
  slaBreached: number;
  strategic: { total: number; active: number };
  bau: { total: number; active: number };
  byPillar: Record<string, number>;
  byCategory: Array<{
    id: string;
    name: string;
    nameEn: string | null;
    code: string | null;
    kind: InvestigationCategoryKind;
    teamId: string | null;
    teamName: string | null;
    childrenCount: number;
    count: number;
    activeCount: number;
  }>;
  byTeam: Array<{ id: string; name: string; code: string | null; count: number; activeCount: number }>;
  categories: InvestigationCategory[];
  teams: InvestigationTeam[];
  recent: InvestigationCase[];
}

/** ข้อมูลที่หน้าอนุมัติผ่านลิงก์อีเมลได้รับ (ไม่ต้องล็อกอิน) */
export interface InvestigationApprovalLink {
  approvalId: string;
  stage: InvestigationApprovalStage;
  stageLabel: string;
  sequence: number;
  approverName: string | null;
  orgRole: InvestigationOrgRole;
  orgRoleLabel: string;
  expiresAt: string | null;
  case: {
    id: string;
    caseNumber: string;
    title: string;
    summary: string | null;
    conclusion: string | null;
    recommendation: string | null;
    status: InvestigationCaseStatus;
    priority: number;
    slaDueAt: string | null;
    openedAt: string;
    categoryName: string | null;
    teamName: string | null;
    issues: Array<{
      id: string;
      title: string;
      detail: string | null;
      status: InvestigationIssueStatus;
      finding: string | null;
    }>;
  };
  previousComments: Array<{
    sequence: number;
    approverName: string | null;
    orgRoleLabel: string;
    decision: InvestigationApprovalDecision;
    comment: string | null;
    decidedAt: string | null;
  }>;
}

export type DispositionKind = "DISPOSED" | "RETURNED";

export interface VehicleDispositionLogEntry {
  id: string;
  vehicleId: string;
  kind: DispositionKind;
  statusName: string;
  licensePlate: string;
  brandModel: string;
  note: string | null;
  actorUserId?: string | null;
  actorUsername?: string | null;
  recordedAt: string;
  vehicle?: { id: string; licensePlate: string; brandModel: string; vehicleStatusId: string | null };
}

export interface AssetDispositionLogEntry {
  id: string;
  assetId: string;
  kind: DispositionKind;
  statusName: string;
  serialNumber: string;
  itemName: string;
  note: string | null;
  actorUserId?: string | null;
  actorUsername?: string | null;
  recordedAt: string;
  asset?: { id: string; serialNumber: string; itemName: string; assetItemStatusId: string | null };
}

export type AuditAction = "CREATE" | "UPDATE" | "DELETE";

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  summary: string;
  beforeJson: string | null;
  afterJson: string | null;
  actorUserId: string | null;
  actorUsername: string | null;
  createdAt: string;
}

export type AssetAttachmentKind = "PHOTO" | "PERMIT";

export interface AssetDocument {
  id: string;
  assetId: string;
  fileUrl: string;
  mimeType: string | null;
  originalName: string | null;
  kind: AssetAttachmentKind;
  sortOrder: number;
  createdAt: string;
}

export interface Asset {
  id: string;
  serialNumber: string;
  itemName: string;
  location: string;
  machineSerialNumber: string | null;
  notes: string | null;
  costCenter: string | null;
  deviceBrand: string | null;
  deviceModel: string | null;
  /** ลำดับในทะเบียน (เช่น เสื้อเกราะ) */
  registryLineNo?: number | null;
  armorLevel?: string | null;
  armorWearStyle?: string | null;
  armorModel?: string | null;
  armorUnitNumber?: string | null;
  permitDocumentNo?: string | null;
  /** วันหมดอายุใบอนุญาต */
  permitExpiresAt?: string | null;
  purchasedAt?: string | null;
  armorExpiresAt?: string | null;
  qrToken: string;
  assetCategoryId: string | null;
  assetCategory: NameMasterRow | null;
  assetRoutineId: string | null;
  assetRoutine: NameMasterRow | null;
  assetAffiliationId: string | null;
  assetAffiliation: NameMasterRow | null;
  assetItemStatusId: string | null;
  assetItemStatus: NameMasterRow | null;
  auditorId: string | null;
  auditor?: { id: string; fullName: string } | null;
  documents?: AssetDocument[];
  _count?: { documents: number };
}

export interface AssetDetail extends Asset {
  documents: AssetDocument[];
}

export type ArmorMonthlyCheckKey =
  | "outerShell"
  | "strapsFasteners"
  | "ballisticLayer"
  | "cleanlinessStorage"
  | "overallReadiness";

export interface ArmorMonthlyInspection {
  id: string;
  assetId: string;
  monthYm: string;
  outerShell: VehicleWeeklyCheckResult | null;
  strapsFasteners: VehicleWeeklyCheckResult | null;
  ballisticLayer: VehicleWeeklyCheckResult | null;
  cleanlinessStorage: VehicleWeeklyCheckResult | null;
  overallReadiness: VehicleWeeklyCheckResult | null;
  remarks: string | null;
  inspectorName?: string | null;
  personnelId: string | null;
  inspectedAt: string;
  updatedAt: string;
}

export interface ArmorMonthlyMatrixRow {
  asset: Asset;
  inspection: ArmorMonthlyInspection | null;
}

export interface ArmorMonthlyMatrixResponse {
  monthYm: string;
  rows: ArmorMonthlyMatrixRow[];
}

export interface ArmorMonthlyReportResponse {
  monthYm: string;
  totalAssets: number;
  inspectedCount: number;
  abnormalRowsCount: number;
  rows: ArmorMonthlyMatrixRow[];
}

export interface MissionAttachmentRow {
  id: string;
  fileUrl: string;
  originalName: string | null;
  mimeType: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface MissionListItem {
  id: string;
  code: string | null;
  title: string | null;
  status: MissionStatus;
  budgetAmount: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  createdAt: string;
  route: RouteMaster | null;
  _count: {
    personnel: number;
    vehicles: number;
    destinations: number;
    expenses: number;
    attachments?: number;
  };
}

/** รายละเอียดภารกิจจาก GET /api/missions/:id — ใช้โหลดฟอร์มแก้ไข */
export interface MissionDetail {
  id: string;
  code: string | null;
  title: string | null;
  status: MissionStatus;
  routeId: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  personnel: Array<{
    id: string;
    personnelId: string;
    personnelRoleId: string;
    compensationRate: string;
  }>;
  vehicles: Array<{
    id: string;
    vehicleId: string;
    vehicleRoleId: string;
    fuelLiters: string | null;
    fuelType: "GASOLINE" | "DIESEL" | null;
  }>;
  destinations: Array<{ address: string; cargoValue: string; containerCount: number; sortOrder: number }>;
  expenses: Array<{ expenseTypeId: string; amount: string }>;
  policeStations?: Array<{
    id?: string;
    policeStationId: string;
    amount: string;
    note?: string | null;
    sortOrder?: number;
    policeStation?: { id: string; name: string; vendorCode?: string | null };
  }>;
  attachments?: MissionAttachmentRow[];
}

export interface MissionSummary {
  missionId: string;
  code: string | null;
  title: string | null;
  status?: MissionStatus;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  route?: {
    id: string;
    name: string;
    startLocation: string;
    endLocation: string;
  } | null;
  budgetAmount: string | null;
  totalExpenses: string;
  /** รวมมูลค่าสินค้าตามจุดส่ง */
  totalCargoValue: string;
  /** รายจ่ายเป็น % ของมูลค่าทรัพย์สิน (null ถ้ามูลค่าสินค้าเป็น 0) */
  expenseToCargoPercent: number | null;
  /** เฉพาะหมวดที่ยอด > 0 */
  expensesByType: Record<string, string>;
  /** รวมค่าตอบแทนจากบุคลากรรายคนในภารกิจ */
  personnelCompensationTotal?: string;
  variance: string | null;
  overBudget: boolean;
  personnel?: Array<{
    personnelId: string;
    fullName: string;
    rank: string | null;
    position?: string | null;
    idNumber?: string | null;
    employeeCode?: string | null;
    gradeLevel?: string | null;
    perDiemRate?: string | null;
    vehicleTravelAllowance?: string | null;
    personnelCategoryName?: string | null;
    policeStationId?: string | null;
    policeStationName?: string | null;
    policeStationVendorCode?: string | null;
    roleName: string;
    compensationRate: string;
  }>;
  policeStations?: Array<{
    policeStationId: string;
    name: string;
    vendorCode?: string | null;
    amount: string;
    note?: string | null;
    sortOrder?: number;
  }>;
  vehicles?: Array<{
    vehicleId: string;
    licensePlate: string;
    roleName: string;
    fuelLiters: string | null;
    fuelType: "GASOLINE" | "DIESEL" | null;
  }>;
  destinations?: Array<{
    address: string;
    cargoValue: string;
    containerCount: number;
    sortOrder: number;
  }>;
  attachments?: MissionAttachmentRow[];
}

export interface PersonnelMissionHistory {
  personnelId: string;
  missionCount: number;
  compensationTotal: string;
  missions: Array<{
    assignmentId: string;
    missionId: string;
    code: string | null;
    title: string | null;
    status: MissionStatus;
    plannedStart: string | null;
    plannedEnd: string | null;
    routeLabel: string | null;
    roleName: string;
    compensationRate: string;
  }>;
}

/** GET /api/missions/stats/year */
export interface MissionYearMonthStat {
  month: number;
  label: string;
  cargoValue: string;
  containers: number;
  expenses: string;
  missionCount: number;
  /** ลิตร — จากภารกิจ (เบนซิน) */
  fuelGasolineLiters?: string;
  /** ลิตร — จากภารกิจ (ดีเซล) */
  fuelDieselLiters?: string;
  /** บาท — บันทึกบำรุงรักษารถในเดือนนั้น */
  maintenanceCost?: string;
}

export interface MissionYearTotals {
  cargoValue: string;
  expenses: string;
  containers: number;
  missionCount: number;
  fuelGasolineLiters: string;
  fuelDieselLiters: string;
  maintenanceCost: string;
}

export interface MissionYearStatsResponse {
  year: number;
  availableYears: number[];
  months: MissionYearMonthStat[];
  /** รวมทั้งปี — ถ้าไม่มีให้รวมจาก months ฝั่ง client */
  yearTotals?: MissionYearTotals;
}

export interface SecurityIncident {
  id: string;
  externalId: number;
  title: string;
  location: string | null;
  incidentAt: string | null;
  timeOfIncident: string | null;
  incidentType: string | null;
  impactLevel: string | null;
  statusResolved: boolean;
  impactTypes: string | null;
  damageValue: string | null;
  cause: string | null;
  details: string | null;
  actionExecuted: string | null;
  preventiveSolutions: string | null;
  commanderOrder: string | null;
  linkBotShare: string | null;
  reportingOfficer: string | null;
  createdBy: string | null;
  sourceCreatedAt: string | null;
  sourceModifiedBy: string | null;
  sourceModifiedAt: string | null;
  attachmentsCount: number;
  createdAt: string;
  updatedAt: string;
}

/** งานจ้าง OS — กลุ่มพื้นที่ */
export interface OsAreaGroup {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  active: boolean;
  budgetAccountId: string | null;
  budgetAccount?: { id: string; name: string; ciCode: string | null } | null;
  contracts?: OsContract[];
  createdAt: string;
  updatedAt: string;
}

export interface OsContractDocumentLink {
  id: string;
  libraryDocumentId: string;
  sortOrder: number;
  createdAt: string;
  title: string;
  fileUrl: string | null;
  mimeType: string | null;
  originalName: string | null;
}

export interface OsContract {
  id: string;
  areaGroupId: string;
  areaGroup?: { id: string; code: string; name: string } | null;
  vendorName: string;
  contractNo: string | null;
  title: string | null;
  startDate: string;
  endDate: string;
  monthlyAmount: number | null;
  notes: string | null;
  active: boolean;
  documents?: OsContractDocumentLink[];
  _count?: { acceptances: number };
  createdAt: string;
  updatedAt: string;
}

export type OsAcceptanceDocumentLink = OsContractDocumentLink;

export interface OsMonthlyAcceptance {
  id: string;
  contractId: string;
  monthYm: string;
  acceptedAmount: number;
  acceptedAt: string;
  remarks: string | null;
  budgetTransactionId: string | null;
  documents?: OsAcceptanceDocumentLink[];
  createdAt: string;
  updatedAt: string;
}


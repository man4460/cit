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
  rank: string | null;
  position: string | null;
  phone: string | null;
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

export interface RouteMaster {
  id: string;
  name: string | null;
  startLocation: string;
  endLocation: string;
  distanceKm: string;
}

export interface NameMasterRow {
  id: string;
  name: string;
  sortOrder: number;
  excludesFromFleetCare?: boolean;
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
  recordedAt: string;
  asset?: { id: string; serialNumber: string; itemName: string; assetItemStatusId: string | null };
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
  _count: { personnel: number; vehicles: number; destinations: number; expenses: number };
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
}

export interface MissionSummary {
  missionId: string;
  code: string | null;
  title: string | null;
  budgetAmount: string | null;
  totalExpenses: string;
  /** รวมมูลค่าสินค้าตามจุดส่ง */
  totalCargoValue: string;
  /** รายจ่ายเป็น % ของมูลค่าทรัพย์สิน (null ถ้ามูลค่าสินค้าเป็น 0) */
  expenseToCargoPercent: number | null;
  expensesByType: Record<string, string>;
  variance: string | null;
  overBudget: boolean;
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

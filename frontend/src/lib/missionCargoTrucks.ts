/** แถวรถบรรทุกสินค้าในขั้น «ข้อมูลรถสินค้า» — ส่วนหัวลิงก์ยานพาหนะ ส่วนหาง/บทบาทกรอกเอง */

export const CARGO_TRUCK_ASSIGN_PREFIX = "cargo:";

export type CargoTruckRow = {
  id: string;
  tractorVehicleId: string;
  tractorPlate: string;
  trailerPlate: string;
  roleId: string;
  role: string;
  driver1PersonnelId: string;
  driver1Name: string;
  driver1IdNumber: string;
  driver1Phone: string;
  driver2PersonnelId: string;
  driver2Name: string;
  driver2IdNumber: string;
  driver2Phone: string;
  note: string;
};

export type CargoDriverPerson = {
  id: string;
  fullName: string;
  rank?: string | null;
  idNumber?: string | null;
  phone?: string | null;
};

export type CargoTractorVehicle = {
  id: string;
  licensePlate: string;
};

export function cargoDriverDisplayName(p: Pick<CargoDriverPerson, "fullName" | "rank">): string {
  return `${p.rank ? `${p.rank} ` : ""}${p.fullName}`.trim();
}

export function cargoDriverSnapshot(p: CargoDriverPerson | undefined): {
  name: string;
  idNumber: string;
  phone: string;
} {
  if (!p) return { name: "", idNumber: "", phone: "" };
  return {
    name: cargoDriverDisplayName(p),
    idNumber: p.idNumber ?? "",
    phone: p.phone ?? "",
  };
}

export function newCargoTruckId(): string {
  return crypto.randomUUID();
}

export function cargoAssignValue(id: string): string {
  return `${CARGO_TRUCK_ASSIGN_PREFIX}${id}`;
}

export function cargoAssignId(value: string): string | null {
  if (!value.startsWith(CARGO_TRUCK_ASSIGN_PREFIX)) return null;
  const id = value.slice(CARGO_TRUCK_ASSIGN_PREFIX.length);
  return id || null;
}

export function blankCargoTruck(role = "", roleId = ""): CargoTruckRow {
  return {
    id: newCargoTruckId(),
    tractorVehicleId: "",
    tractorPlate: "",
    trailerPlate: "",
    roleId,
    role,
    driver1PersonnelId: "",
    driver1Name: "",
    driver1IdNumber: "",
    driver1Phone: "",
    driver2PersonnelId: "",
    driver2Name: "",
    driver2IdNumber: "",
    driver2Phone: "",
    note: "",
  };
}

export function nextSuggestedCargoRole(
  rows: Pick<CargoTruckRow, "role" | "roleId">[],
  masters: Array<{ id: string; name: string }>,
): { role: string; roleId: string } {
  const usedIds = new Set(rows.map((r) => r.roleId.trim()).filter(Boolean));
  const usedNames = new Set(rows.map((r) => r.role.trim()).filter(Boolean));
  const free = masters.find((m) => !usedIds.has(m.id) && !usedNames.has(m.name));
  if (free) return { role: free.name, roleId: free.id };
  return { role: "", roleId: "" };
}

export function matchCargoRoleId(
  masters: Array<{ id: string; name: string }>,
  roleId?: string | null,
  roleName?: string | null,
): string {
  if (roleId && masters.some((m) => m.id === roleId)) return roleId;
  const n = (roleName ?? "").trim();
  if (!n) return "";
  return masters.find((m) => m.name === n)?.id ?? "";
}

export function withCargoRole(
  row: CargoTruckRow,
  roleId: string,
  masters: Array<{ id: string; name: string }>,
): CargoTruckRow {
  const hit = masters.find((m) => m.id === roleId);
  return { ...row, roleId, role: hit?.name ?? "" };
}

export function cargoTruckFilled(row: CargoTruckRow): boolean {
  return Boolean(
    row.tractorVehicleId.trim() ||
      row.tractorPlate.trim() ||
      row.trailerPlate.trim() ||
      row.roleId.trim() ||
      row.role.trim() ||
      row.driver1PersonnelId.trim() ||
      row.driver2PersonnelId.trim() ||
      row.driver1Name.trim() ||
      row.driver2Name.trim(),
  );
}

export function cargoTruckDriverNames(row: CargoTruckRow): string[] {
  return [row.driver1Name, row.driver2Name].map((s) => s.trim()).filter(Boolean);
}

export function cargoTruckDriverCount(rows: CargoTruckRow[]): number {
  return rows.reduce((n, r) => n + cargoTruckDriverNames(r).length, 0);
}

/** บทบาทมีคำว่าหัวลาก หรือไม่กรอกหางและไม่ได้ระบุว่าเป็นสินค้า */
export function isSpareCargoTractor(row: Pick<CargoTruckRow, "trailerPlate" | "role">): boolean {
  const role = row.role.trim();
  if (/หัวลาก/.test(role)) return true;
  if (/สินค้า/.test(role)) return false;
  return !row.trailerPlate.trim();
}

export function cargoTruckCallSign(row: CargoTruckRow): string {
  const head = row.tractorPlate.trim();
  const tail = row.trailerPlate.trim();
  if (head && tail) return `${head} / ${tail}`;
  return head || tail;
}

export function cargoRoleLabel(
  row: Pick<CargoTruckRow, "role" | "trailerPlate">,
  goodsIndex: number,
  spareIndex: number,
  spareCount: number,
): string {
  const typed = row.role.trim();
  if (typed) return typed;
  if (isSpareCargoTractor(row)) {
    return spareCount > 1 ? `หัวลากสำรอง ${spareIndex + 1}` : "หัวลากสำรอง";
  }
  return `สินค้า ${goodsIndex + 1}`;
}

export function cargoTruckSeatLabel(row: CargoTruckRow, goodsIndex: number, spareIndex: number, spareCount: number): string {
  const cs = cargoTruckCallSign(row);
  const name = cargoRoleLabel(row, goodsIndex, spareIndex, spareCount);
  return cs ? `${name} (${cs})` : name;
}

export function cargoSeatKey(row: Pick<CargoTruckRow, "id" | "tractorVehicleId">): string {
  return row.tractorVehicleId.trim() || row.id;
}

export function cargoTruckSeatOptions(rows: CargoTruckRow[]): Array<{ value: string; label: string }> {
  const filled = rows.filter((r) => r.id && cargoTruckFilled(r));
  const goods = filled.filter((t) => !isSpareCargoTractor(t));
  const spares = filled.filter(isSpareCargoTractor);
  const out: Array<{ value: string; label: string }> = [];
  goods.forEach((t, i) => out.push({ value: cargoAssignValue(t.id), label: cargoTruckSeatLabel(t, i, 0, 0) }));
  spares.forEach((t, i) =>
    out.push({ value: cargoAssignValue(t.id), label: cargoTruckSeatLabel(t, 0, i, spares.length) }),
  );
  return out;
}

export function withCargoDriver(
  row: CargoTruckRow,
  slot: 1 | 2,
  personnelId: string,
  person: CargoDriverPerson | undefined,
): CargoTruckRow {
  const snap = cargoDriverSnapshot(personnelId ? person : undefined);
  if (slot === 1) {
    return {
      ...row,
      driver1PersonnelId: personnelId,
      driver1Name: snap.name,
      driver1IdNumber: snap.idNumber,
      driver1Phone: snap.phone,
    };
  }
  return {
    ...row,
    driver2PersonnelId: personnelId,
    driver2Name: snap.name,
    driver2IdNumber: snap.idNumber,
    driver2Phone: snap.phone,
  };
}

export function withCargoTractor(
  row: CargoTruckRow,
  vehicleId: string,
  vehicle: CargoTractorVehicle | undefined,
): CargoTruckRow {
  return {
    ...row,
    tractorVehicleId: vehicleId,
    tractorPlate: vehicle?.licensePlate ?? (vehicleId ? row.tractorPlate : ""),
  };
}

export function matchCargoDriverId(
  people: CargoDriverPerson[],
  personnelId?: string | null,
  idNumber?: string | null,
  name?: string | null,
): string {
  if (personnelId && people.some((p) => p.id === personnelId)) return personnelId;
  const idn = (idNumber ?? "").replace(/\D/g, "");
  if (idn.length >= 12) {
    const hit = people.find((p) => (p.idNumber ?? "").replace(/\D/g, "") === idn);
    if (hit) return hit.id;
  }
  const n = (name ?? "").trim();
  if (!n) return "";
  const hit = people.find((p) => cargoDriverDisplayName(p) === n || p.fullName === n);
  return hit?.id ?? "";
}

export function matchTractorVehicleId(
  vehicles: CargoTractorVehicle[],
  vehicleId?: string | null,
  plate?: string | null,
): string {
  if (vehicleId && vehicles.some((v) => v.id === vehicleId)) return vehicleId;
  const raw = (plate ?? "").trim();
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, "").toLowerCase();
  const hit = vehicles.find((v) => v.licensePlate.replace(/\s+/g, "").toLowerCase() === compact);
  return hit?.id ?? "";
}

function inferredCargoRole(row: { role?: string | null; note?: string | null }): string {
  const role = (row.role ?? "").trim();
  if (role) return role;
  const note = (row.note ?? "").trim();
  return /สินค้า|หัวลาก/.test(note) ? note : "";
}

export function toCargoTruckForm(row: Partial<CargoTruckRow> & { id?: string | null } | null | undefined): CargoTruckRow {
  const b = blankCargoTruck();
  if (!row) return b;
  return {
    id: row.id?.trim() || b.id,
    tractorVehicleId: row.tractorVehicleId ?? "",
    tractorPlate: row.tractorPlate ?? "",
    trailerPlate: row.trailerPlate ?? "",
    roleId: row.roleId ?? "",
    role: inferredCargoRole(row),
    driver1PersonnelId: row.driver1PersonnelId ?? "",
    driver1Name: row.driver1Name ?? "",
    driver1IdNumber: row.driver1IdNumber ?? "",
    driver1Phone: row.driver1Phone ?? "",
    driver2PersonnelId: row.driver2PersonnelId ?? "",
    driver2Name: row.driver2Name ?? "",
    driver2IdNumber: row.driver2IdNumber ?? "",
    driver2Phone: row.driver2Phone ?? "",
    note: row.note ?? "",
  };
}

import "dotenv/config";
import path from "path";
import { Prisma } from "@prisma/client";
import { PrismaClientInitializationError } from "@prisma/client/runtime/library";
import express from "express";
import cors from "cors";
import { ensureUploadDir } from "./lib/upload.js";
import { ensureBootstrapAdmin } from "./lib/bootstrapAdmin.js";
import { authMiddleware } from "./middleware/auth.js";
import { auditTrailMiddleware } from "./middleware/auditTrail.js";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { adminUsersRouter } from "./routes/adminUsers.js";
import { tasksRouter } from "./routes/tasks.js";
import { seedPersonnelMasterData } from "./lib/seedPersonnelMasters.js";
import { personnelRouter } from "./routes/personnel.js";
import { personnelCategoriesRouter } from "./routes/personnelCategories.js";
import { organizationUnitTypesRouter } from "./routes/organizationUnitTypes.js";
import { vehiclesRouter } from "./routes/vehicles.js";
import { vehicleTypesRouter } from "./routes/vehicleTypes.js";
import { workCategoryGroupsRouter } from "./routes/workCategoryGroups.js";
import { vehicleStatusesRouter } from "./routes/vehicleStatuses.js";
import { seedVehicleMasterData } from "./lib/seedVehicleMasters.js";
import { seedAssetMasterData } from "./lib/seedAssetMasters.js";
import { seedRadioAssets } from "./lib/seedRadios.js";
import { assetCategoriesRouter } from "./routes/assetCategories.js";
import { assetRoutinesRouter } from "./routes/assetRoutines.js";
import { assetAffiliationsRouter } from "./routes/assetAffiliations.js";
import { assetItemStatusesRouter } from "./routes/assetItemStatuses.js";
import { armorInspectionsRouter } from "./routes/armorInspections.js";
import { assetsRouter } from "./routes/assets.js";
import { routeMasterRouter } from "./routes/routeMaster.js";
import { missionPersonnelRolesRouter } from "./routes/missionPersonnelRoles.js";
import { missionVehicleRolesRouter } from "./routes/missionVehicleRoles.js";
import { missionExpenseTypesRouter } from "./routes/missionExpenseTypes.js";
import { policeStationsRouter } from "./routes/policeStations.js";
import { missionsRouter } from "./routes/missions.js";
import { seedMissionMasterData } from "./lib/seedMissionMasters.js";
import { trainingCoursesRouter } from "./routes/trainingCourses.js";
import { trainingEnrollmentsRouter } from "./routes/trainingEnrollments.js";
import { documentTypesRouter } from "./routes/documentTypes.js";
import { libraryDocumentsRouter } from "./routes/libraryDocuments.js";
import { fireExtinguishersRouter } from "./routes/fireExtinguishers.js";
import { fireHostsRouter } from "./routes/fireHosts.js";
import { firearmsRouter } from "./routes/firearms.js";
import { ammunitionRouter } from "./routes/ammunition.js";
import { bulletproofVestsRouter } from "./routes/bulletproofVests.js";
import { auditLogsRouter } from "./routes/auditLogs.js";
import { securityIncidentsRouter } from "./routes/securityIncidents.js";
import { budgetRouter } from "./routes/budget.js";
import { investigationRouter } from "./routes/investigation.js";
import { investigationApprovalRouter } from "./routes/investigationApproval.js";
import { osOutsourcingRouter } from "./routes/osOutsourcing.js";
import { seedDocumentMasterData } from "./lib/seedDocumentMasters.js";
import { seedFireExtinguisherData } from "./lib/seedFireExtinguishers.js";
import { seedWeaponData } from "./lib/seedWeapons.js";
import { seedBulletproofVestData } from "./lib/seedBulletproofVests.js";
import { seedInvestigationCategories } from "./lib/seedInvestigationCategories.js";
import { seedInvestigationTeams } from "./lib/seedInvestigationTeams.js";
import { seedOsAreaGroups } from "./lib/seedOsAreaGroups.js";

const app = express();
const port = Number(process.env.PORT) || 4000;
/** 0.0.0.0 = รับจากมือถือ/เครื่องอื่นใน LAN (ค่าเริ่มต้น) */
const host = process.env.HOST ?? "0.0.0.0";

ensureUploadDir();

app.use(cors({ origin: true }));
app.use(express.json());

const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "cit-mission-api" });
});

app.use("/api/auth", authRouter);
/** อนุมัติผ่านลิงก์อีเมล — เข้าถึงได้โดยไม่ต้องล็อกอิน (ตรวจสิทธิ์ด้วย token) */
app.use("/api/investigation-approval", investigationApprovalRouter);

const secured = express.Router();
secured.use(authMiddleware);
secured.use(auditTrailMiddleware());
secured.use(meRouter);
secured.use("/personnel-categories", personnelCategoriesRouter);
secured.use("/organization-unit-types", organizationUnitTypesRouter);
secured.use("/personnel", personnelRouter);
secured.use("/training-courses", trainingCoursesRouter);
secured.use("/training-enrollments", trainingEnrollmentsRouter);
secured.use("/document-types", documentTypesRouter);
secured.use("/library-documents", libraryDocumentsRouter);
secured.use("/fire-extinguishers", fireExtinguishersRouter);
secured.use("/fire-hosts", fireHostsRouter);
secured.use("/firearms", firearmsRouter);
secured.use("/ammunition", ammunitionRouter);
secured.use("/bulletproof-vests", bulletproofVestsRouter);
secured.use("/vehicle-types", vehicleTypesRouter);
secured.use("/work-category-groups", workCategoryGroupsRouter);
secured.use("/vehicle-statuses", vehicleStatusesRouter);
secured.use("/vehicles", vehiclesRouter);
secured.use("/asset-categories", assetCategoriesRouter);
secured.use("/asset-routines", assetRoutinesRouter);
secured.use("/asset-affiliations", assetAffiliationsRouter);
secured.use("/asset-item-statuses", assetItemStatusesRouter);
secured.use("/assets", assetsRouter);
secured.use("/armor-inspections", armorInspectionsRouter);
secured.use("/route-master", routeMasterRouter);
secured.use("/mission-personnel-roles", missionPersonnelRolesRouter);
secured.use("/mission-vehicle-roles", missionVehicleRolesRouter);
secured.use("/mission-expense-types", missionExpenseTypesRouter);
secured.use("/police-stations", policeStationsRouter);
secured.use("/missions", missionsRouter);
secured.use("/tasks", tasksRouter);
secured.use("/admin/users", adminUsersRouter);
secured.use("/audit-logs", auditLogsRouter);
secured.use("/security-incidents", securityIncidentsRouter);
  secured.use("/budget", budgetRouter);
  secured.use("/investigation", investigationRouter);
  secured.use("/os-outsourcing", osOutsourcingRouter);

app.use("/api", secured);

const DB_SCHEMA_HINT =
  "ฐานข้อมูลยังไม่อัปเดตให้ตรงโค้ด — เปิดเทอร์มินัลที่โฟลเดอร์ backend แล้วรัน npx prisma db push แล้วรีสตาร์ท API (ถ้าใช้ PostgreSQL ใช้ migrate deploy ตาม workflow ของคุณ)";

function apiErrorBody(err: unknown): { status: number; body: { error: string; details?: string } } {
  if (err instanceof PrismaClientInitializationError) {
    return {
      status: 500,
      body: {
        error:
          "เชื่อมต่อฐานข้อมูลไม่ได้ — ตรวจสอบ DATABASE_URL ใน backend/.env (SQLite: file ต้องอยู่ใต้โฟลเดอร์ที่รัน API) แล้วรัน npx prisma db push",
        details: err.message,
      },
    };
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2021" || err.code === "P2022" || err.code === "P1014") {
      return {
        status: 500,
        body: {
          error: DB_SCHEMA_HINT,
          details: err.message,
        },
      };
    }
  }
  const expose = process.env.NODE_ENV !== "production" || process.env.API_ERROR_DETAILS === "1";
  const msg = err instanceof Error ? err.message : String(err);
  if (expose) {
    return { status: 500, body: { error: msg } };
  }
  return { status: 500, body: { error: "Internal server error" } };
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const { status, body } = apiErrorBody(err);
  res.status(status).json(body);
});

void ensureBootstrapAdmin()
  .then(() => seedPersonnelMasterData())
  .then(() => seedVehicleMasterData())
  .then(() => seedAssetMasterData())
  .then(() => seedRadioAssets())
  .then(() => seedMissionMasterData())
  .then(() => seedDocumentMasterData())
  .then(() => seedFireExtinguisherData())
  .then(() => seedWeaponData())
  .then(() => seedBulletproofVestData())
  .then(() => seedInvestigationTeams())
  .then(() => seedInvestigationCategories())
  .then(() => seedOsAreaGroups())
  .then(() => {
    app.listen(port, host, () => {
      const hint = host === "0.0.0.0" ? "ทุก interface (LAN ใช้ http://<IP-เครื่องนี้>:" + port + ")" : host;
      console.log(`API listening on port ${port} — ${hint}`);
    });
  });

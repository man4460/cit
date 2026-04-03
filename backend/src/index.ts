import "dotenv/config";
import path from "path";
import { Prisma } from "@prisma/client";
import express from "express";
import cors from "cors";
import { ensureUploadDir } from "./lib/upload.js";
import { ensureBootstrapAdmin } from "./lib/bootstrapAdmin.js";
import { authMiddleware } from "./middleware/auth.js";
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
import { assetCategoriesRouter } from "./routes/assetCategories.js";
import { assetRoutinesRouter } from "./routes/assetRoutines.js";
import { assetAffiliationsRouter } from "./routes/assetAffiliations.js";
import { assetItemStatusesRouter } from "./routes/assetItemStatuses.js";
import { assetsRouter } from "./routes/assets.js";
import { routeMasterRouter } from "./routes/routeMaster.js";
import { missionPersonnelRolesRouter } from "./routes/missionPersonnelRoles.js";
import { missionVehicleRolesRouter } from "./routes/missionVehicleRoles.js";
import { missionExpenseTypesRouter } from "./routes/missionExpenseTypes.js";
import { missionsRouter } from "./routes/missions.js";
import { seedMissionMasterData } from "./lib/seedMissionMasters.js";
import { trainingCoursesRouter } from "./routes/trainingCourses.js";
import { trainingEnrollmentsRouter } from "./routes/trainingEnrollments.js";
import { documentTypesRouter } from "./routes/documentTypes.js";
import { libraryDocumentsRouter } from "./routes/libraryDocuments.js";
import { seedDocumentMasterData } from "./lib/seedDocumentMasters.js";

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

const secured = express.Router();
secured.use(authMiddleware);
secured.use(meRouter);
secured.use("/personnel-categories", personnelCategoriesRouter);
secured.use("/organization-unit-types", organizationUnitTypesRouter);
secured.use("/personnel", personnelRouter);
secured.use("/training-courses", trainingCoursesRouter);
secured.use("/training-enrollments", trainingEnrollmentsRouter);
secured.use("/document-types", documentTypesRouter);
secured.use("/library-documents", libraryDocumentsRouter);
secured.use("/vehicle-types", vehicleTypesRouter);
secured.use("/work-category-groups", workCategoryGroupsRouter);
secured.use("/vehicle-statuses", vehicleStatusesRouter);
secured.use("/vehicles", vehiclesRouter);
secured.use("/asset-categories", assetCategoriesRouter);
secured.use("/asset-routines", assetRoutinesRouter);
secured.use("/asset-affiliations", assetAffiliationsRouter);
secured.use("/asset-item-statuses", assetItemStatusesRouter);
secured.use("/assets", assetsRouter);
secured.use("/route-master", routeMasterRouter);
secured.use("/mission-personnel-roles", missionPersonnelRolesRouter);
secured.use("/mission-vehicle-roles", missionVehicleRolesRouter);
secured.use("/mission-expense-types", missionExpenseTypesRouter);
secured.use("/missions", missionsRouter);
secured.use("/tasks", tasksRouter);
secured.use("/admin/users", adminUsersRouter);

app.use("/api", secured);

function apiErrorBody(err: unknown): { status: number; body: { error: string; details?: string } } {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2021" || err.code === "P2022") {
      return {
        status: 500,
        body: {
          error:
            "ฐานข้อมูลไม่ตรงกับโค้ดปัจจุบัน — ที่โฟลเดอร์ backend รัน npx prisma db push (หรือ migrate) แล้วรีสตาร์ท API",
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
  .then(() => seedMissionMasterData())
  .then(() => seedDocumentMasterData())
  .then(() => {
    app.listen(port, host, () => {
      const hint = host === "0.0.0.0" ? "ทุก interface (LAN ใช้ http://<IP-เครื่องนี้>:" + port + ")" : host;
      console.log(`API listening on port ${port} — ${hint}`);
    });
  });

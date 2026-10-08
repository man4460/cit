import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Shell } from "./layout/Shell";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { AdminRoute } from "./routes/AdminRoute";
import { ActivitiesPage } from "./pages/ActivitiesPage";
import { Dashboard } from "./pages/Dashboard";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { PersonnelSelfPage } from "./pages/PersonnelSelfPage";
import { PersonnelPage } from "./pages/PersonnelPage";
import { TrainingRegistryPage } from "./pages/TrainingRegistryPage";
import { AuditTrailPage } from "./pages/AuditTrailPage";
import { VehiclesPage } from "./pages/VehiclesPage";
import { VehicleMaintenancePage } from "./pages/VehicleMaintenancePage";
import { VehicleWeeklyInspectionPage } from "./pages/VehicleWeeklyInspectionPage";
import { ArmorMonthlyInspectionPage } from "./pages/ArmorMonthlyInspectionPage";
import { AssetsPage } from "./pages/AssetsPage";
import { MissionsPage } from "./pages/MissionsPage";
import { MissionFormPage } from "./pages/MissionFormPage";
import { MissionSummaryPage } from "./pages/MissionSummaryPage";
import { MissionCentralMemoPage } from "./pages/MissionCentralMemoPage";
import { MissionTravelPlanMemoPage } from "./pages/MissionTravelPlanMemoPage";
import { RouteMasterPage } from "./pages/RouteMasterPage";
import { ReportPage } from "./pages/ReportPage";
import { ReportsHubPage } from "./pages/ReportsHubPage";
import { ScanPage } from "./pages/ScanPage";
import { AdminPage } from "./pages/AdminPage";
import { RegistrationReviewPage } from "./pages/RegistrationReviewPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { FireSafetyPage } from "./pages/FireSafetyPage";
import { WeaponsPage } from "./pages/WeaponsPage";
import { ArmorVestsPage } from "./pages/ArmorVestsPage";
import { RadiosPage } from "./pages/RadiosPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SecurityIncidentsPage } from "./pages/SecurityIncidentsPage";
import { SecurityIncidentsDashboard } from "./pages/SecurityIncidentsDashboard";
import { BudgetOverviewPage } from "./pages/budget/BudgetOverviewPage";
import { BudgetYearPage } from "./pages/budget/BudgetYearPage";
import { InvestigationDashboardPage } from "./pages/investigation/InvestigationDashboardPage";
import { InvestigationCasesPage } from "./pages/investigation/InvestigationCasesPage";
import { InvestigationCaseDetailPage } from "./pages/investigation/InvestigationCaseDetailPage";
import { InvestigationCaseReportPage } from "./pages/investigation/InvestigationCaseReportPage";
import { InvestigationApprovalsPage } from "./pages/investigation/InvestigationApprovalsPage";
import { InvestigationTeamsPage } from "./pages/investigation/InvestigationTeamsPage";
import { ApprovalLinkPage } from "./pages/ApprovalLinkPage";
import { OsOutsourcingPage } from "./pages/os-outsourcing/OsOutsourcingPage";
import { OsOutsourcingDashboard } from "./pages/os-outsourcing/OsOutsourcingDashboard";
import { ExecutiveReportPage } from "./pages/ExecutiveReportPage";
import { MissionEvaluationDetailPage } from "./pages/MissionEvaluationDetailPage";
import { MissionEvaluationFormPage } from "./pages/MissionEvaluationFormPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          {/* บุคลากรกรอก/แก้ไขข้อมูลตนเอง — ไม่ต้องล็อกอิน ไม่มีเมนู */}
          <Route path="/self/:token" element={<PersonnelSelfPage />} />
          {/* อนุมัติผ่านลิงก์อีเมล — ไม่ต้องเข้าสู่ระบบ */}
          <Route path="/approve/:token" element={<ApprovalLinkPage />} />
          {/* บุคลากรในทริปประเมินภารกิจผ่าน QR — ไม่ต้องล็อกอิน */}
          <Route path="/evaluate/:token" element={<MissionEvaluationFormPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Shell />}>
              <Route index element={<Dashboard />} />
              <Route path="personnel" element={<PersonnelPage />} />
              <Route path="training" element={<TrainingRegistryPage />} />
              <Route path="vehicles" element={<VehiclesPage />} />
              <Route path="disposition-registry" element={<Navigate to="/vehicles?view=disposed" replace />} />
              <Route path="vehicles/weekly-inspection" element={<VehicleWeeklyInspectionPage />} />
              <Route path="vehicles/:vehicleId/maintenance" element={<VehicleMaintenancePage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="fire-safety" element={<FireSafetyPage />} />
              <Route path="weapons" element={<WeaponsPage />} />
              <Route path="vests" element={<ArmorVestsPage />} />
              <Route path="radios" element={<RadiosPage />} />
              <Route path="assets" element={<AssetsPage />} />
              <Route path="assets/armor-monthly" element={<ArmorMonthlyInspectionPage />} />
              <Route path="missions" element={<MissionsPage />} />
              <Route path="missions/new" element={<MissionFormPage />} />
              <Route path="missions/:id/summary" element={<MissionSummaryPage />} />
              <Route path="missions/:id/central-memo" element={<MissionCentralMemoPage />} />
              <Route path="missions/:id/travel-plan-memo" element={<MissionTravelPlanMemoPage />} />
              <Route path="missions/:missionId/evaluation" element={<MissionEvaluationDetailPage />} />
              <Route path="missions/:id/edit" element={<MissionFormPage />} />
              <Route path="missions/:id/duplicate" element={<MissionFormPage />} />
              <Route path="missions/estimates/*" element={<Navigate to="/missions" replace />} />
              <Route path="routes" element={<RouteMasterPage />} />
              <Route path="activities" element={<ActivitiesPage />} />
              <Route path="security-incidents/dashboard" element={<SecurityIncidentsDashboard />} />
              <Route path="security-incidents" element={<SecurityIncidentsPage />} />
              <Route path="os-outsourcing" element={<OsOutsourcingPage />} />
              <Route path="os-outsourcing/dashboard" element={<OsOutsourcingDashboard />} />
              <Route path="executive-report" element={<ExecutiveReportPage />} />
              <Route path="investigation" element={<InvestigationDashboardPage />} />
              <Route path="investigation/cases" element={<InvestigationCasesPage />} />
              <Route path="investigation/cases/:caseId" element={<InvestigationCaseDetailPage />} />
              <Route path="investigation/cases/:caseId/report" element={<InvestigationCaseReportPage />} />
              <Route path="investigation/approvals" element={<InvestigationApprovalsPage />} />
              <Route path="investigation/teams" element={<InvestigationTeamsPage />} />
              <Route path="budget" element={<Navigate to="/budget/overview/2569" replace />} />
              <Route path="budget/overview/:yearBe" element={<BudgetOverviewPage />} />
              <Route path="budget/requests" element={<Navigate to="/budget/overview/2570" replace />} />
              <Route path="budget/year/:yearBe/:view" element={<BudgetYearPage />} />
              <Route path="budget/year/:yearBe" element={<BudgetYearPage />} />
              <Route path="budget/commitment" element={<Navigate to="/budget/year/2569?funding=commitment" replace />} />
              <Route path="budget/accounts" element={<Navigate to="/budget/year/2569" replace />} />
              <Route path="budget/spend" element={<Navigate to="/budget/year/2569" replace />} />
              <Route path="tasks" element={<Navigate to="/activities" replace />} />
              <Route path="reports" element={<ReportsHubPage />} />
              <Route path="reports/:slug" element={<ReportPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route element={<AdminRoute />}>
                <Route path="scan" element={<ScanPage />} />
                <Route path="admin" element={<AdminPage />} />
                <Route path="admin/registrations" element={<RegistrationReviewPage />} />
                <Route path="audit-trail" element={<AuditTrailPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

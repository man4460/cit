import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Shell } from "./layout/Shell";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { AdminRoute } from "./routes/AdminRoute";
import { ActivitiesPage } from "./pages/ActivitiesPage";
import { Dashboard } from "./pages/Dashboard";
import { LoginPage } from "./pages/LoginPage";
import { PersonnelPage } from "./pages/PersonnelPage";
import { TrainingRegistryPage } from "./pages/TrainingRegistryPage";
import { AuditTrailPage } from "./pages/AuditTrailPage";
import { VehiclesPage } from "./pages/VehiclesPage";
import { VehicleMaintenancePage } from "./pages/VehicleMaintenancePage";
import { VehicleWeeklyInspectionPage } from "./pages/VehicleWeeklyInspectionPage";
import { ArmorMonthlyInspectionPage } from "./pages/ArmorMonthlyInspectionPage";
import { AssetsPage } from "./pages/AssetsPage";
import { MissionsPage } from "./pages/MissionsPage";
import { RouteMasterPage } from "./pages/RouteMasterPage";
import { ReportPage } from "./pages/ReportPage";
import { ReportsHubPage } from "./pages/ReportsHubPage";
import { ScanPage } from "./pages/ScanPage";
import { AdminPage } from "./pages/AdminPage";
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
              <Route path="routes" element={<RouteMasterPage />} />
              <Route path="activities" element={<ActivitiesPage />} />
              <Route path="security-incidents/dashboard" element={<SecurityIncidentsDashboard />} />
              <Route path="security-incidents" element={<SecurityIncidentsPage />} />
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

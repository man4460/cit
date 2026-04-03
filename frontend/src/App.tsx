import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Shell } from "./layout/Shell";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { ActivitiesPage } from "./pages/ActivitiesPage";
import { Dashboard } from "./pages/Dashboard";
import { LoginPage } from "./pages/LoginPage";
import { PersonnelPage } from "./pages/PersonnelPage";
import { TrainingRegistryPage } from "./pages/TrainingRegistryPage";
import { DispositionRegistryPage } from "./pages/DispositionRegistryPage";
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
import { ProfilePage } from "./pages/ProfilePage";

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
              <Route path="disposition-registry" element={<DispositionRegistryPage />} />
              <Route path="vehicles/weekly-inspection" element={<VehicleWeeklyInspectionPage />} />
              <Route path="vehicles/:vehicleId/maintenance" element={<VehicleMaintenancePage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="assets" element={<AssetsPage />} />
              <Route path="assets/armor-monthly" element={<ArmorMonthlyInspectionPage />} />
              <Route path="missions" element={<MissionsPage />} />
              <Route path="routes" element={<RouteMasterPage />} />
              <Route path="activities" element={<ActivitiesPage />} />
              <Route path="tasks" element={<Navigate to="/activities" replace />} />
              <Route path="reports" element={<ReportsHubPage />} />
              <Route path="reports/:slug" element={<ReportPage />} />
              <Route path="scan" element={<ScanPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { getDashboardForRole } from "./services/api";
import ProtectedRoute from "./components/ProtectedRoute";
import MemberLayout from "./components/MemberLayout";

// Auth
import Login from "./pages/Auth/Login";

// Member
import MemberDashboard from "./pages/Member/MemberDashboard";
import Applications from "./pages/Member/Applications";
import EquipmentCatalog from "./pages/Member/EquipmentCatalog";
import Notifications from "./pages/Member/Notifications";
import Settings from "./pages/Member/Settings";

// Manager
import ManagerDashboard from "./pages/Manager/ManagerDashboard";
import BookingApprovals from "./pages/Manager/BookingApprovals";
import Units from "./pages/Manager/Units";
import ManagerCalendar from "./pages/Manager/ManagerCalendar";
import Drivers from "./pages/Manager/Drivers";
import Payments from "./pages/Manager/Payments";
import Expenses from "./pages/Manager/Expenses";

// Admin
import AdminDashboard from "./pages/Admin/AdminDashboard";
import AccountManagement from "./pages/Admin/AccountManagement";
import AdminFinancialPolicies from "./pages/Admin/AdminFinancialPolicies";
import AdminReports from "./pages/Admin/AdminReports";
import AdminBackups from "./pages/Admin/AdminBackups";
import AuditLogs from "./pages/Admin/AuditLogs";

function RootRedirect() {
  const { user, isAuthenticated } = useAuth();
  if (isAuthenticated && user?.role) {
    return <Navigate to={getDashboardForRole(user.role)} replace />;
  }
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Login />} />
      <Route path="/registration" element={<Login />} />

      {/* Member Routes */}
      <Route
        path="/member"
        element={
          <ProtectedRoute allowedRoles={["member", "manager", "admin"]}>
            <MemberLayout>
              <MemberDashboard />
            </MemberLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/applications"
        element={
          <ProtectedRoute allowedRoles={["member", "manager", "admin"]}>
            <MemberLayout>
              <Applications />
            </MemberLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/member/book"
        element={
          <ProtectedRoute allowedRoles={["member", "manager", "admin"]}>
            <MemberLayout>
              <EquipmentCatalog />
            </MemberLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/member/book/:id"
        element={
          <ProtectedRoute allowedRoles={["member", "manager", "admin"]}>
            <MemberLayout>
              <EquipmentCatalog />
            </MemberLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/member/notifications"
        element={
          <ProtectedRoute allowedRoles={["member", "manager", "admin"]}>
            <MemberLayout>
              <Notifications />
            </MemberLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/member/settings"
        element={
          <ProtectedRoute allowedRoles={["member", "manager", "admin"]}>
            <MemberLayout>
              <Settings />
            </MemberLayout>
          </ProtectedRoute>
        }
      />

      {/* Manager Routes */}
      <Route
        path="/manager"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <ManagerDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/booking-approvals"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <BookingApprovals />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/bookings"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <BookingApprovals />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/units"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <Units />
          </ProtectedRoute>
        }
      />
      <Route
        path="/units"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <Units />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/calendar"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <ManagerCalendar />
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <ManagerCalendar />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/drivers"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <Drivers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/drivers"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <Drivers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/financials"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <Payments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/financials"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <Payments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/financials/payments"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <Payments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/financials/payments"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <Payments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/payments"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <Payments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/financials/expenses"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <Expenses />
          </ProtectedRoute>
        }
      />
      <Route
        path="/financials/expenses"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <Expenses />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/expenses"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <Expenses />
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/account-management"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AccountManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/financial-policies"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminFinancialPolicies />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminReports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/backups"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminBackups />
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit-logs"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AuditLogs />
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

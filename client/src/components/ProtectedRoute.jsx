import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getDashboardForRole } from "../services/api";
import { getCoverPermissions, featureForPath, accessFor, firstAllowedPath } from "../services/coverAccess";

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <p>Loading application...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={getDashboardForRole(user.role)} replace />;
  }

  // Covering staff only reach the manager pages the admin granted them.
  const perms = user.role === "manager" ? getCoverPermissions() : null;
  const feature = perms ? featureForPath(location.pathname) : null;
  if (feature && !accessFor(feature, perms)) {
    const fallback = firstAllowedPath(perms);
    if (fallback !== location.pathname) return <Navigate to={fallback} replace />;
  }

  return children;
}

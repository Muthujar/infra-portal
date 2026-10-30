// Page routes. Pages inside <ProtectedRoute> need a logged-in user.

import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { CatalogPage } from "./pages/CatalogPage";
import { RequestsPage } from "./pages/RequestsPage";
import { RequestDetailPage } from "./pages/RequestDetailPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { AdminPage } from "./pages/AdminPage";
import type { Role } from "./types";

function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <p className="muted">Loading...</p>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  // The API checks roles too; this just hides pages the user cannot use.
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/catalog" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/requests/:id" element={<RequestDetailPage />} />
        <Route
          path="/approvals"
          element={
            <ProtectedRoute roles={["APPROVER", "ADMIN"]}>
              <ApprovalsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <AdminPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/catalog" replace />} />
    </Routes>
  );
}

// The top navigation bar. Links depend on the user's role (RBAC in the UI).

import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return null;
  }

  const canApprove = user.role === "APPROVER" || user.role === "ADMIN";
  const isAdmin = user.role === "ADMIN";

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Infra Portal</div>
        <nav>
          <NavLink to="/catalog">Catalog</NavLink>
          <NavLink to="/requests">{canApprove ? "Requests" : "My requests"}</NavLink>
          {canApprove && <NavLink to="/approvals">Approvals</NavLink>}
          {isAdmin && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <div className="user">
          <span>
            {user.name} · {user.role} · {user.teamName}
          </span>
          <button className="link" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

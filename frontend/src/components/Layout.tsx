// The top navigation bar. Links depend on the user's role (RBAC in the UI).

import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api";
import { useFeedback } from "./Feedback";
import type { ServerRequest } from "../types";

const ROLE_LABELS = {
  REQUESTER: "Requester",
  APPROVER: "Approver",
  ADMIN: "Admin",
};

export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <rect x="8" y="8" width="16" height="6" rx="1.5" fill="#fff" opacity="0.95" />
      <rect x="8" y="18" width="16" height="6" rx="1.5" fill="#fff" opacity="0.6" />
      <circle cx="21" cy="11" r="1.3" fill="currentColor" />
      <circle cx="21" cy="21" r="1.3" fill="currentColor" />
    </svg>
  );
}

function initials(name: string): string {
  const words = name.replace(/\(.*\)/, "").trim().split(/\s+/);
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm } = useFeedback();
  const [pendingCount, setPendingCount] = useState(0);

  const canApprove = user?.role === "APPROVER" || user?.role === "ADMIN";

  // Show how many requests wait for this approver, refreshed on every page change.
  useEffect(() => {
    if (!canApprove) {
      return;
    }
    api<ServerRequest[]>("/requests/pending-approvals")
      .then((list) => setPendingCount(list.length))
      .catch(() => setPendingCount(0));
  }, [canApprove, location.pathname]);

  if (!user) {
    return null;
  }

  const isAdmin = user.role === "ADMIN";

  async function handleLogout() {
    const ok = await confirm({
      title: "Log out?",
      message: "You will need to sign in again to use the portal.",
      confirmLabel: "Log out",
    });
    if (!ok) {
      return;
    }
    logout();
    navigate("/login");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/catalog" className="brand">
            <Logo />
            <span>Infra Portal</span>
          </NavLink>
          <nav>
            <NavLink to="/catalog">Catalog</NavLink>
            <NavLink to="/requests">{canApprove ? "Requests" : "My requests"}</NavLink>
            {canApprove && (
              <NavLink to="/approvals">
                Approvals
                {pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}
              </NavLink>
            )}
            {isAdmin && <NavLink to="/admin">Admin</NavLink>}
          </nav>
          <div className="user">
            <span className="avatar" aria-hidden="true">
              {initials(user.name)}
            </span>
            <span className="user-text">
              <span className="user-name">{user.name}</span>
              <span className="user-meta">
                {ROLE_LABELS[user.role]} · {user.teamName}
              </span>
            </span>
            <button className="ghost" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

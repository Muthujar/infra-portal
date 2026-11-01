// The sidebar navigation. Links depend on the user's role (RBAC in the UI).

import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { formatRole, initials } from "../format";
import { useConfirm } from "./ConfirmDialog";
import { Icon } from "./Icon";

// Pages fire this after a decision, so the number in the sidebar stays right.
export const APPROVALS_CHANGED = "approvals-changed";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();
  const [pendingCount, setPendingCount] = useState(0);

  const canApprove = user?.role === "APPROVER" || user?.role === "ADMIN";

  useEffect(() => {
    if (!canApprove) {
      return;
    }
    async function loadCount() {
      try {
        const pending = await api<unknown[]>("/requests/pending-approvals");
        setPendingCount(pending.length);
      } catch {
        // Only a hint in the sidebar, so a failed refresh can be ignored.
      }
    }
    loadCount();
    window.addEventListener(APPROVALS_CHANGED, loadCount);
    return () => window.removeEventListener(APPROVALS_CHANGED, loadCount);
  }, [canApprove, location.pathname]);

  if (!user) {
    return null;
  }

  const isAdmin = user.role === "ADMIN";

  async function handleLogout() {
    const answer = await confirm({
      title: "Log out?",
      message: "You will need to sign in again to use the portal.",
      confirmLabel: "Log out",
    });
    if (answer === null) {
      return;
    }
    logout();
    navigate("/login");
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="server" size={18} />
          </span>
          Infra Portal
        </div>
        <nav aria-label="Main">
          <NavLink to="/catalog">
            <Icon name="server" /> Catalog
          </NavLink>
          <NavLink to="/requests">
            <Icon name="list" /> {canApprove ? "Requests" : "My requests"}
          </NavLink>
          {canApprove && (
            <NavLink to="/approvals">
              <Icon name="checkCircle" /> Approvals
              {pendingCount > 0 && (
                <span className="nav-count" aria-label={pendingCount + " waiting"}>
                  {pendingCount}
                </span>
              )}
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/admin">
              <Icon name="settings" /> Admin
            </NavLink>
          )}
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{initials(user.name)}</span>
          <div className="sidebar-user-text">
            <strong>{user.name}</strong>
            <span>
              {formatRole(user.role)} · {user.teamName}
            </span>
          </div>
          <button className="icon-button" onClick={handleLogout} aria-label="Log out" title="Log out">
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

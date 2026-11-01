// List of requests: your own (requester) or your team's / everyone's (approver, admin).

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { isInProgress, StatusBadge } from "../components/StatusBadge";
import { EmptyState, EnvTag, Loading, PageHeader } from "../components/Ui";
import { timeAgo } from "../format";
import type { RequestStatus, ServerRequest } from "../types";

// Filter tabs above the table, and which statuses each one shows.
const FILTERS: { key: string; label: string; statuses: RequestStatus[] | null }[] = [
  { key: "all", label: "All", statuses: null },
  { key: "pending", label: "Waiting", statuses: ["PENDING_APPROVAL"] },
  { key: "active", label: "In progress", statuses: ["APPROVED", "PROVISIONING", "CONFIGURING", "DECOMMISSIONING"] },
  { key: "ready", label: "Ready", statuses: ["COMPLETED"] },
  { key: "problems", label: "Failed / rejected", statuses: ["FAILED", "REJECTED"] },
  { key: "deleted", label: "Deleted", statuses: ["DECOMMISSIONED"] },
];

export function RequestsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ServerRequest[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let timer: number | undefined;

    async function load() {
      try {
        const data = await api<ServerRequest[]>("/requests");
        setRequests(data);

        // While any request is still being worked on, refresh every 3 seconds.
        if (data.some((request) => isInProgress(request.status))) {
          timer = window.setTimeout(load, 3000);
        }
      } catch (err) {
        setError((err as Error).message);
        setRequests([]);
      }
    }

    load();
    return () => window.clearTimeout(timer);
  }, []);

  const isRequester = user?.role === "REQUESTER";
  const all = requests || [];

  function countFor(statuses: RequestStatus[] | null): number {
    return statuses ? all.filter((r) => statuses.includes(r.status)).length : all.length;
  }

  const activeFilter = FILTERS.find((f) => f.key === filter) || FILTERS[0];
  const query = search.trim().toLowerCase();
  const shown = all.filter((request) => {
    if (activeFilter.statuses && !activeFilter.statuses.includes(request.status)) {
      return false;
    }
    if (query === "") {
      return true;
    }
    return (
      request.hostname.includes(query) ||
      request.catalogItem.name.toLowerCase().includes(query) ||
      request.requester.name.toLowerCase().includes(query) ||
      String(request.id) === query.replace("#", "")
    );
  });

  return (
    <div>
      <PageHeader
        title={isRequester ? "My requests" : "Requests"}
        subtitle={isRequester ? "Servers you asked for and where each one is." : "Requests from your team (admins see all teams)."}
        actions={<Link className="button" to="/catalog">New request</Link>}
      />
      {error && <div className="error">{error}</div>}

      {requests === null && <Loading />}

      {requests !== null && all.length === 0 && !error && (
        <EmptyState icon="📭" title="No requests yet">
          Go to the <Link to="/catalog">catalog</Link> to request your first server.
        </EmptyState>
      )}

      {all.length > 0 && (
        <>
          <div className="toolbar">
            <div className="tabs" role="tablist">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={filter === f.key}
                  className={"tab" + (filter === f.key ? " active" : "")}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                  <span className="tab-count">{countFor(f.statuses)}</span>
                </button>
              ))}
            </div>
            <input
              className="search"
              type="search"
              placeholder="Search servers or people"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="table-wrap">
            <table className="clickable">
              <thead>
                <tr>
                  <th>Server</th>
                  <th>Type</th>
                  <th>Env</th>
                  {!isRequester && <th>Requested by</th>}
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((request) => (
                  <tr key={request.id} onClick={() => navigate("/requests/" + request.id)}>
                    <td>
                      <Link to={"/requests/" + request.id} className="row-title" onClick={(e) => e.stopPropagation()}>
                        {request.hostname}
                      </Link>
                      <div className="muted small">#{request.id}</div>
                    </td>
                    <td>
                      {request.catalogItem.name}
                      <div className="muted small">{request.platform === "AWS" ? "AWS" : "Proxmox"}</div>
                    </td>
                    <td>
                      <EnvTag env={request.environment} />
                    </td>
                    {!isRequester && <td>{request.requester.name}</td>}
                    <td>
                      <StatusBadge status={request.status} />
                    </td>
                    <td className="nowrap">{request.expiresAt ? new Date(request.expiresAt).toLocaleDateString() : <span className="muted">-</span>}</td>
                    <td className="nowrap" title={new Date(request.createdAt).toLocaleString()}>
                      {timeAgo(request.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && <p className="muted table-empty">No requests match this filter.</p>}
          </div>
        </>
      )}
    </div>
  );
}

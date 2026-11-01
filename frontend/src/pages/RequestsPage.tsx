// List of requests: your own (requester) or your team's / everyone's (approver, admin).

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "../components/Icon";
import { EmptyState, PageHeader, Skeleton } from "../components/Page";
import { isInProgress, StatusBadge } from "../components/StatusBadge";
import { expiresSoon, formatDate, formatDateTime, formatPlatform } from "../format";
import type { RequestStatus, ServerRequest } from "../types";

const FILTERS: { key: string; label: string; statuses: RequestStatus[] | null }[] = [
  { key: "all", label: "All", statuses: null },
  { key: "waiting", label: "Waiting", statuses: ["PENDING_APPROVAL"] },
  { key: "active", label: "In progress", statuses: ["APPROVED", "PROVISIONING", "CONFIGURING", "DECOMMISSIONING"] },
  { key: "ready", label: "Ready", statuses: ["COMPLETED"] },
  { key: "failed", label: "Failed", statuses: ["FAILED"] },
  { key: "closed", label: "Closed", statuses: ["REJECTED", "DECOMMISSIONED"] },
];

export function RequestsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [requests, setRequests] = useState<ServerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterKey, setFilterKey] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let timer: number | undefined;

    async function load() {
      try {
        const data = await api<ServerRequest[]>("/requests");
        setRequests(data);

        // While any request is still being worked on, refresh every 3 seconds.
        let anyBusy = false;
        for (const request of data) {
          if (isInProgress(request.status)) {
            anyBusy = true;
          }
        }
        if (anyBusy) {
          timer = window.setTimeout(load, 3000);
        }
      } catch (err) {
        setError((err as Error).message);
      }
      setLoading(false);
    }

    load();
    return () => window.clearTimeout(timer);
  }, []);

  function countFor(statuses: RequestStatus[] | null): number {
    if (!statuses) {
      return requests.length;
    }
    return requests.filter((request) => statuses.includes(request.status)).length;
  }

  const filter = FILTERS.find((option) => option.key === filterKey) || FILTERS[0];
  const words = search.trim().toLowerCase();
  const shown = requests.filter((request) => {
    if (filter.statuses && !filter.statuses.includes(request.status)) {
      return false;
    }
    if (words === "") {
      return true;
    }
    const text = request.hostname + " " + request.requester.name + " " + request.catalogItem.name;
    return text.toLowerCase().includes(words);
  });

  const isRequester = user?.role === "REQUESTER";

  return (
    <div>
      <PageHeader
        title={isRequester ? "My requests" : "Requests"}
        subtitle={isRequester ? "Servers you have requested." : "Server requests you can see."}
        actions={
          <Link className="button" to="/catalog">
            <Icon name="plus" size={16} /> New request
          </Link>
        }
      />
      {error && <div className="notice notice-error">{error}</div>}
      {loading && <Skeleton rows={5} />}

      {!loading && requests.length === 0 && !error && (
        <EmptyState title="No requests yet" text="Pick a server from the catalog to get started.">
          <Link className="button" to="/catalog">
            Go to catalog
          </Link>
        </EmptyState>
      )}

      {requests.length > 0 && (
        <>
          <div className="toolbar">
            <div className="pills" role="group" aria-label="Filter by status">
              {FILTERS.map((option) => (
                <button
                  key={option.key}
                  className={filterKey === option.key ? "active" : ""}
                  aria-pressed={filterKey === option.key}
                  onClick={() => setFilterKey(option.key)}
                >
                  {option.label} <span>{countFor(option.statuses)}</span>
                </button>
              ))}
            </div>
            <div className="search">
              <Icon name="search" size={16} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search hostname, person, type"
                aria-label="Search requests"
              />
            </div>
          </div>

          {shown.length === 0 && <EmptyState icon="search" title="No matching requests" text="Try another filter or search." />}

          {shown.length > 0 && (
            <div className="table-wrap">
              <table className="table-cards">
                <thead>
                  <tr>
                    <th>Server</th>
                    <th>Env</th>
                    <th>Requested by</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((request) => (
                    <tr className="row-link" key={request.id} onClick={() => navigate("/requests/" + request.id)}>
                      <td className="cell-main">
                        <Link className="row-title" to={"/requests/" + request.id} onClick={(e) => e.stopPropagation()}>
                          {request.hostname}
                        </Link>
                        <div className="muted small">
                          #{request.id} · {request.catalogItem.name} · {formatPlatform(request.platform)}
                        </div>
                      </td>
                      <td>
                        <span className={"tag env-" + request.environment.toLowerCase()}>{request.environment}</span>
                      </td>
                      <td className="cell-extra">{request.requester.name}</td>
                      <td>
                        <StatusBadge status={request.status} />
                      </td>
                      <td className="nowrap cell-extra">
                        {request.expiresAt && request.status === "COMPLETED" ? (
                          <span className={expiresSoon(request.expiresAt) ? "text-warn" : ""}>
                            {formatDate(request.expiresAt)}
                          </span>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td className="nowrap muted cell-extra">{formatDateTime(request.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

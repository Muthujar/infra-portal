// List of requests: your own (requester) or your team's / everyone's (approver, admin).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { isInProgress, StatusBadge } from "../components/StatusBadge";
import type { ServerRequest } from "../types";

export function RequestsPage() {
  const [requests, setRequests] = useState<ServerRequest[]>([]);
  const [error, setError] = useState("");

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
    }

    load();
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div>
      <h1>Requests</h1>
      {error && <div className="error">{error}</div>}
      {requests.length === 0 && <p className="muted">No requests yet. Go to the catalog to request a server.</p>}

      {requests.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Hostname</th>
              <th>Type</th>
              <th>Env</th>
              <th>Requested by</th>
              <th>Status</th>
              <th>Expires</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{request.id}</td>
                <td>
                  <Link to={"/requests/" + request.id}>{request.hostname}</Link>
                </td>
                <td>
                  {request.catalogItem.name} <span className="muted">({request.platform})</span>
                </td>
                <td>{request.environment}</td>
                <td>{request.requester.name}</td>
                <td>
                  <StatusBadge status={request.status} />
                </td>
                <td>{request.expiresAt ? new Date(request.expiresAt).toLocaleDateString() : "-"}</td>
                <td>{new Date(request.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

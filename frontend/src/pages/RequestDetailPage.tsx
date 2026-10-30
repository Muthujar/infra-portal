// One request: details, timeline (audit log), generated Terraform and logs.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { isInProgress, StatusBadge } from "../components/StatusBadge";
import type { ServerRequest } from "../types";

// The happy-path steps shown as a progress line.
const STEPS = ["PENDING_APPROVAL", "APPROVED", "PROVISIONING", "CONFIGURING", "COMPLETED"];
const STEP_LABELS = ["Submitted", "Approved", "Creating server", "Setting up", "Ready"];

export function RequestDetailPage() {
  const params = useParams();
  const requestId = params.id;
  const [request, setRequest] = useState<ServerRequest | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [reloadCounter, setReloadCounter] = useState(0);

  useEffect(() => {
    let timer: number | undefined;

    async function load() {
      try {
        const data = await api<ServerRequest>("/requests/" + requestId);
        setRequest(data);
        // Keep refreshing while the worker is busy.
        if (isInProgress(data.status)) {
          timer = window.setTimeout(load, 2000);
        }
      } catch (err) {
        setError((err as Error).message);
      }
    }

    load();
    return () => window.clearTimeout(timer);
  }, [requestId, reloadCounter]);

  async function runAction(action: "retry" | "decommission") {
    if (action === "decommission") {
      const sure = window.confirm("Delete this server? This cannot be undone.");
      if (!sure) {
        return;
      }
    }
    setActionError("");
    try {
      await api("/requests/" + requestId + "/" + action, "POST");
      setReloadCounter(reloadCounter + 1);
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  if (error) {
    return <div className="error">{error}</div>;
  }
  if (!request) {
    return <p className="muted">Loading...</p>;
  }

  // Which step of the progress line are we on?
  let currentStep = STEPS.indexOf(request.status);
  if (request.status === "DECOMMISSIONING" || request.status === "DECOMMISSIONED") {
    currentStep = STEPS.length - 1;
  }

  const canRetry = request.status === "FAILED";
  const canDecommission = request.status === "COMPLETED" || request.status === "FAILED";

  return (
    <div>
      <p>
        <Link to="/requests">← Back to requests</Link>
      </p>
      <div className="title-row">
        <h1>
          #{request.id} {request.hostname}
        </h1>
        <StatusBadge status={request.status} />
      </div>

      {currentStep >= 0 && (
        <ol className="steps">
          {STEP_LABELS.map((label, index) => {
            let className = "step";
            if (index < currentStep) className = "step done";
            if (index === currentStep) className = "step current";
            return (
              <li className={className} key={label}>
                {label}
              </li>
            );
          })}
        </ol>
      )}

      {request.errorMessage && request.status === "FAILED" && (
        <div className="error">Error: {request.errorMessage}</div>
      )}
      {actionError && <div className="error">{actionError}</div>}

      <div className="actions">
        {canRetry && <button onClick={() => runAction("retry")}>Retry</button>}
        {canDecommission && (
          <button className="danger" onClick={() => runAction("decommission")}>
            Decommission (delete server)
          </button>
        )}
      </div>

      <div className="detail-grid">
        <div className="card">
          <h3>Details</h3>
          <dl>
            <dt>Type</dt>
            <dd>{request.catalogItem.name}</dd>
            <dt>Platform</dt>
            <dd>{request.platform}</dd>
            <dt>Size</dt>
            <dd>
              {request.cpu} CPU · {request.memoryMb} MB RAM · {request.diskGb} GB disk
            </dd>
            <dt>OS</dt>
            <dd>{request.catalogItem.osName}</dd>
            <dt>Environment</dt>
            <dd>{request.environment}</dd>
            <dt>Team</dt>
            <dd>{request.team.name}</dd>
            <dt>Requested by</dt>
            <dd>{request.requester.name}</dd>
            <dt>Reason</dt>
            <dd>{request.justification}</dd>
            <dt>Approver</dt>
            <dd>
              {request.approver ? request.approver.name : "-"}
              {request.approvalComment ? ' ("' + request.approvalComment + '")' : ""}
            </dd>
            <dt>Server id</dt>
            <dd>{request.externalId || "-"}</dd>
            <dt>AWX job</dt>
            <dd>{request.configJobId || "-"}</dd>
          </dl>
        </div>

        <div className="card">
          <h3>Timeline</h3>
          <ul className="timeline">
            {(request.auditEvents || []).map((event) => (
              <li key={event.id}>
                <div className="muted small">
                  {new Date(event.createdAt).toLocaleString()} · {event.actor ? event.actor.name : "System"}
                </div>
                <div>{event.message}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {request.terraformCode && (
        <details className="card" open>
          <summary>Generated Terraform (main.tf)</summary>
          <pre>{request.terraformCode}</pre>
        </details>
      )}

      {request.provisionLog && (
        <details className="card">
          <summary>Provisioning log</summary>
          <pre>{request.provisionLog}</pre>
        </details>
      )}
    </div>
  );
}

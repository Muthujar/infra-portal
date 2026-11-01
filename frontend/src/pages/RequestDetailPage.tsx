// One request: details, timeline (audit log), generated Terraform and logs.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useFeedback } from "../components/Feedback";
import { isInProgress, StatusBadge } from "../components/StatusBadge";
import { EnvTag, Loading, PlatformTag } from "../components/Ui";
import { formatMemory, timeAgo } from "../format";
import type { RequestStatus, ServerRequest } from "../types";

// The happy-path steps shown as a progress line.
const STEPS: RequestStatus[] = ["PENDING_APPROVAL", "APPROVED", "PROVISIONING", "CONFIGURING", "COMPLETED"];
const STEP_LABELS = ["Submitted", "Approved", "Creating server", "Setting up", "Ready"];

interface Step {
  label: string;
  state: "done" | "current" | "failed" | "todo";
}

// Work out what the progress line shows for the request's status.
function buildSteps(request: ServerRequest): Step[] {
  const status = request.status;

  if (status === "REJECTED") {
    return [
      { label: "Submitted", state: "done" },
      { label: "Rejected", state: "failed" },
    ];
  }

  if (status === "FAILED") {
    // Find the step that was running when it failed (from the audit log).
    const failEvent = (request.auditEvents || []).find((e) => e.toStatus === "FAILED");
    let failedAt = STEPS.indexOf(failEvent?.fromStatus || "PROVISIONING");
    if (failedAt < 0) {
      failedAt = 2;
    }
    return STEP_LABELS.map((label, index) => {
      if (index < failedAt) return { label, state: "done" };
      if (index === failedAt) return { label: label + " failed", state: "failed" };
      return { label, state: "todo" };
    });
  }

  if (status === "DECOMMISSIONING" || status === "DECOMMISSIONED") {
    const steps: Step[] = STEP_LABELS.map((label) => ({ label, state: "done" }));
    steps.push({ label: status === "DECOMMISSIONING" ? "Deleting" : "Deleted", state: status === "DECOMMISSIONING" ? "current" : "done" });
    return steps;
  }

  const current = STEPS.indexOf(status);
  return STEP_LABELS.map((label, index) => {
    if (index < current) return { label, state: "done" };
    // "Ready" is the end of the line, so it shows as done rather than "in progress".
    if (index === current) return { label, state: status === "COMPLETED" ? "done" : "current" };
    return { label, state: "todo" };
  });
}

export function RequestDetailPage() {
  const params = useParams();
  const requestId = params.id;
  const { confirm, toast } = useFeedback();
  const [request, setRequest] = useState<ServerRequest | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
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

  async function call(path: string, body: unknown, doneText: string) {
    setActionError("");
    setBusy(true);
    try {
      await api("/requests/" + requestId + "/" + path, "POST", body);
      toast(doneText);
      setReloadCounter((n) => n + 1);
    } catch (err) {
      setActionError((err as Error).message);
    }
    setBusy(false);
  }

  async function extendLease() {
    if (!request) return;
    const ok = await confirm({
      title: "Extend the lease by 30 days?",
      message: request.expiresAt ? (
        <p>
          <strong>{request.hostname}</strong> now expires on {new Date(request.expiresAt).toLocaleDateString()}. It will expire 30 days later.
        </p>
      ) : undefined,
      confirmLabel: "Extend lease",
    });
    if (ok) {
      await call("extend", { days: 30 }, "Lease extended by 30 days");
    }
  }

  async function retry() {
    if (!request) return;
    const ok = await confirm({
      title: "Retry creating this server?",
      message: <p>The portal runs Terraform again for <strong>{request.hostname}</strong> with the same settings.</p>,
      confirmLabel: "Retry",
    });
    if (ok) {
      await call("retry", undefined, "Retrying " + request.hostname);
    }
  }

  async function decommission() {
    if (!request) return;
    const ok = await confirm({
      title: "Delete this server?",
      message: (
        <>
          <p>
            Terraform destroys <strong>{request.hostname}</strong> and everything on it. Its quota is given back to the team.
          </p>
          <p className="muted">This cannot be undone. Type the hostname to confirm.</p>
        </>
      ),
      input: { label: "Hostname", placeholder: request.hostname, mustMatch: request.hostname },
      confirmLabel: "Delete server",
      danger: true,
    });
    if (ok) {
      await call("decommission", undefined, request.hostname + " is being deleted");
    }
  }

  async function copyTerraform() {
    if (!request?.terraformCode) return;
    try {
      await navigator.clipboard.writeText(request.terraformCode);
      toast("main.tf copied to the clipboard", "info");
    } catch {
      toast("Could not copy. Select the text and copy it by hand.", "error");
    }
  }

  if (error) {
    return (
      <div>
        <p>
          <Link to="/requests" className="back-link">← Back to requests</Link>
        </p>
        <div className="error">{error}</div>
      </div>
    );
  }
  if (!request) {
    return <Loading />;
  }

  const steps = buildSteps(request);
  const canRetry = request.status === "FAILED";
  const canDecommission = request.status === "COMPLETED" || request.status === "FAILED";
  const canExtend = request.status === "COMPLETED" && request.expiresAt !== null;

  let leaseText = "No expiry";
  if (request.expiresAt) {
    leaseText = "Expires " + new Date(request.expiresAt).toLocaleString();
  } else if (request.leaseDays) {
    leaseText = request.leaseDays + " days, starts when the server is ready";
  }

  return (
    <div>
      <p>
        <Link to="/requests" className="back-link">← Back to requests</Link>
      </p>

      <div className="detail-header">
        <div>
          <div className="detail-title">
            <h1>{request.hostname}</h1>
            <StatusBadge status={request.status} />
          </div>
          <p className="muted detail-meta">
            #{request.id} · {request.catalogItem.name} · <PlatformTag platform={request.platform} /> <EnvTag env={request.environment} /> ·
            requested by {request.requester.name} {timeAgo(request.createdAt)}
          </p>
        </div>
        <div className="page-actions">
          {canRetry && (
            <button onClick={retry} disabled={busy}>
              Retry
            </button>
          )}
          {canExtend && (
            <button className="secondary" onClick={extendLease} disabled={busy}>
              Extend lease
            </button>
          )}
          {canDecommission && (
            <button className="danger-outline" onClick={decommission} disabled={busy}>
              Delete server
            </button>
          )}
        </div>
      </div>

      <ol className="steps">
        {steps.map((step, index) => (
          <li className={"step step-" + step.state} key={step.label}>
            <span className="step-dot" aria-hidden="true">
              {step.state === "done" ? "✓" : step.state === "failed" ? "✕" : index + 1}
            </span>
            <span className="step-label">{step.label}</span>
          </li>
        ))}
      </ol>

      {request.errorMessage && request.status === "FAILED" && (
        <div className="error">
          <strong>What went wrong:</strong> {request.errorMessage}
        </div>
      )}
      {request.status === "REJECTED" && request.approvalComment && (
        <div className="error">
          <strong>Rejected by {request.approver?.name}:</strong> {request.approvalComment}
        </div>
      )}
      {actionError && <div className="error">{actionError}</div>}

      <div className="detail-grid">
        <div className="card">
          <h3>Details</h3>
          <dl>
            <dt>Size</dt>
            <dd>
              {request.cpu} CPU · {formatMemory(request.memoryMb)} RAM · {request.diskGb} GB disk
            </dd>
            <dt>OS</dt>
            <dd>{request.catalogItem.osName}</dd>
            <dt>Team</dt>
            <dd>{request.team.name}</dd>
            <dt>Reason</dt>
            <dd>{request.justification}</dd>
            <dt>Approver</dt>
            <dd>
              {request.approver ? request.approver.name : <span className="muted">Not decided yet</span>}
              {request.approvalComment && request.status !== "REJECTED" ? ' ("' + request.approvalComment + '")' : ""}
            </dd>
            <dt>Lease</dt>
            <dd>{leaseText}</dd>
            <dt>Server id</dt>
            <dd>{request.externalId ? <code>{request.externalId}</code> : <span className="muted">-</span>}</dd>
            <dt>AWX job</dt>
            <dd>{request.configJobId ? <code>{request.configJobId}</code> : <span className="muted">-</span>}</dd>
          </dl>
        </div>

        <div className="card">
          <h3>Timeline</h3>
          <ul className="timeline">
            {(request.auditEvents || []).map((event) => (
              <li key={event.id} className={event.toStatus === "FAILED" || event.toStatus === "REJECTED" ? "bad" : ""}>
                <div>{event.message}</div>
                <div className="muted small" title={new Date(event.createdAt).toLocaleString()}>
                  {event.actor ? event.actor.name : "System"} · {new Date(event.createdAt).toLocaleTimeString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {request.terraformCode && (
        <details className="card code-card">
          <summary>
            Generated Terraform <code>main.tf</code>
          </summary>
          <div className="code-actions">
            <button className="secondary small-button" onClick={copyTerraform}>
              Copy
            </button>
          </div>
          <pre>{request.terraformCode}</pre>
        </details>
      )}

      {request.provisionLog && (
        <details className="card code-card">
          <summary>Provisioning log</summary>
          <pre>{request.provisionLog}</pre>
        </details>
      )}
    </div>
  );
}

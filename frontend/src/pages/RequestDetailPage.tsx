// One request: details, timeline (audit log), generated Terraform and logs.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useConfirm } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { EmptyState, PageHeader, Skeleton } from "../components/Page";
import { isInProgress, StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { expiresSoon, formatDateTime, formatMemory, formatPlatform } from "../format";
import type { ServerRequest } from "../types";

// The happy-path steps shown as a progress line.
const STEPS = ["PENDING_APPROVAL", "APPROVED", "PROVISIONING", "CONFIGURING", "COMPLETED"];
const STEP_LABELS = ["Submitted", "Approved", "Creating server", "Setting up", "Ready"];
const EXTEND_DAYS = 30;

export function RequestDetailPage() {
  const params = useParams();
  const requestId = params.id;
  const confirm = useConfirm();
  const toast = useToast();
  const [request, setRequest] = useState<ServerRequest | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [outputTab, setOutputTab] = useState<"terraform" | "log" | null>(null);
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

  async function runAction(path: string, body: unknown, done: string) {
    setBusy(true);
    try {
      await api("/requests/" + requestId + "/" + path, "POST", body);
      toast.success(done);
      setReloadCounter(reloadCounter + 1);
    } catch (err) {
      toast.error((err as Error).message);
    }
    setBusy(false);
  }

  async function retry() {
    if (!request) {
      return;
    }
    const answer = await confirm({
      title: "Retry " + request.hostname + "?",
      message: "The failed step runs again.",
      confirmLabel: "Retry",
    });
    if (answer !== null) {
      await runAction("retry", undefined, "Retry started.");
    }
  }

  async function extendLease() {
    if (!request || !request.expiresAt) {
      return;
    }
    // The API counts from the current expiry, or from now if it has already passed.
    const expiry = new Date(request.expiresAt).getTime();
    const start = Math.max(expiry, Date.now());
    const newExpiry = new Date(start + EXTEND_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const answer = await confirm({
      title: "Extend the lease by " + EXTEND_DAYS + " days?",
      details: [
        { label: "Server", value: request.hostname },
        { label: "Expires now", value: formatDateTime(request.expiresAt) },
        { label: "New expiry", value: formatDateTime(newExpiry) },
      ],
      confirmLabel: "Extend lease",
    });
    if (answer !== null) {
      await runAction("extend", { days: EXTEND_DAYS }, "Lease extended.");
    }
  }

  async function decommission() {
    if (!request) {
      return;
    }
    const answer = await confirm({
      title: "Decommission " + request.hostname + "?",
      message: "The server and everything on it are deleted. This cannot be undone.",
      warning: request.environment === "PROD" ? "This is a production server." : undefined,
      confirmLabel: "Decommission",
      danger: true,
      typeToConfirm: request.hostname,
    });
    if (answer !== null) {
      await runAction("decommission", undefined, request.hostname + " is being decommissioned.");
    }
  }

  async function copyOutput(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied.");
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  }

  if (error) {
    return (
      <EmptyState icon="alert" title="Could not open this request" text={error}>
        <Link className="button secondary" to="/requests">
          Back to requests
        </Link>
      </EmptyState>
    );
  }
  if (!request) {
    return <Skeleton rows={4} />;
  }

  // Which step of the progress line are we on?
  let currentStep = STEPS.indexOf(request.status);
  // A server that is being deleted, or was deleted, gets one more step after "Ready".
  let stepLabels = STEP_LABELS;
  if (request.status === "DECOMMISSIONING" || request.status === "DECOMMISSIONED") {
    const lastLabel = request.status === "DECOMMISSIONING" ? "Deleting" : "Deleted";
    stepLabels = [...STEP_LABELS, lastLabel];
    currentStep = stepLabels.length - 1;
  }

  const canRetry = request.status === "FAILED";
  const canDecommission = request.status === "COMPLETED" || request.status === "FAILED";
  const canExtend = request.status === "COMPLETED" && request.expiresAt !== null;
  const working = isInProgress(request.status);

  let leaseText = "No expiry";
  if (request.status === "DECOMMISSIONED" || request.status === "REJECTED") {
    leaseText = "-";
  } else if (request.expiresAt) {
    leaseText = "Expires " + formatDateTime(request.expiresAt);
  } else if (request.leaseDays) {
    leaseText = request.leaseDays + " days, starts when the server is ready";
  }

  // A failed request opens on the log, because that is what you need to read.
  const hasLog = request.provisionLog !== null && request.provisionLog !== "";
  const hasTerraform = request.terraformCode !== null;
  let tab = outputTab;
  if (tab === null) {
    tab = (request.status === "FAILED" || working) && hasLog ? "log" : "terraform";
  }
  if (tab === "log" && !hasLog) {
    tab = "terraform";
  }
  const output = tab === "log" ? request.provisionLog : request.terraformCode;

  return (
    <div>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/requests">Requests</Link> <span aria-hidden="true">/</span> <span>{request.hostname}</span>
      </nav>

      <PageHeader
        title={request.hostname}
        subtitle={
          <>
            #{request.id} · {request.catalogItem.name} · {formatPlatform(request.platform)}
          </>
        }
        actions={
          <>
            {canRetry && (
              <button disabled={busy} onClick={retry}>
                Retry
              </button>
            )}
            {canExtend && (
              <button className="secondary" disabled={busy} onClick={extendLease}>
                Extend lease
              </button>
            )}
            {canDecommission && (
              <button className="secondary-danger" disabled={busy} onClick={decommission}>
                Decommission
              </button>
            )}
          </>
        }
      />

      <div className="status-line">
        <StatusBadge status={request.status} />
        <span className={"tag env-" + request.environment.toLowerCase()}>{request.environment}</span>
        {working && (
          <span className="live muted small">
            <span className="live-dot" /> Updating live
          </span>
        )}
      </div>

      {currentStep >= 0 && (
        <ol className="steps">
          {stepLabels.map((label, index) => {
            let className = "step";
            if (index < currentStep) className = "step done";
            if (index === currentStep) className = "step current";
            return (
              <li className={className} key={label} aria-current={index === currentStep ? "step" : undefined}>
                <span className="step-dot">{index < currentStep ? <Icon name="check" size={13} /> : index + 1}</span>
                <span>{label}</span>
              </li>
            );
          })}
        </ol>
      )}

      {request.status === "PENDING_APPROVAL" && (
        <div className="notice notice-info">
          Waiting for {request.environment === "PROD" ? "an admin" : "the team lead"} to approve this request.
        </div>
      )}
      {request.status === "REJECTED" && (
        <div className="notice notice-error">
          <strong>Rejected{request.approver ? " by " + request.approver.name : ""}.</strong>
          {request.approvalComment && " " + request.approvalComment}
        </div>
      )}
      {request.errorMessage && request.status === "FAILED" && (
        <div className="notice notice-error">
          <strong>This request failed.</strong> {request.errorMessage}
        </div>
      )}
      {request.status === "COMPLETED" && request.expiresAt && expiresSoon(request.expiresAt) && (
        <div className="notice notice-warn">
          This server is deleted automatically on {formatDateTime(request.expiresAt)}. Extend the lease to keep it.
        </div>
      )}

      <div className="detail-grid">
        <section className="card">
          <h3>Details</h3>
          <dl className="details">
            <dt>Size</dt>
            <dd>
              {request.cpu} CPU · {formatMemory(request.memoryMb)} RAM · {request.diskGb} GB disk
            </dd>
            <dt>OS</dt>
            <dd>{request.catalogItem.osName}</dd>
            <dt>Team</dt>
            <dd>{request.team.name}</dd>
            <dt>Requested by</dt>
            <dd>{request.requester.name}</dd>
            <dt>Reason</dt>
            <dd>{request.justification}</dd>
            <dt>Approver</dt>
            <dd>
              {request.approver ? request.approver.name : "-"}
              {request.approvalComment && request.status !== "REJECTED" ? ' ("' + request.approvalComment + '")' : ""}
            </dd>
            <dt>Lease</dt>
            <dd>{leaseText}</dd>
            <dt>Server ID</dt>
            <dd>{request.externalId || "-"}</dd>
            <dt>AWX job</dt>
            <dd>{request.configJobId || "-"}</dd>
          </dl>
        </section>

        <section className="card">
          <h3>Timeline</h3>
          <ul className="timeline">
            {(request.auditEvents || []).map((event) => (
              <li key={event.id}>
                <div className="muted small">
                  {formatDateTime(event.createdAt)} · {event.actor ? event.actor.name : "System"}
                </div>
                <div>{event.message}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {(hasTerraform || hasLog) && (
        <section className="card output">
          <div className="output-head">
            <div className="tabs" role="tablist">
              {hasTerraform && (
                <button role="tab" aria-selected={tab === "terraform"} onClick={() => setOutputTab("terraform")}>
                  Terraform
                </button>
              )}
              {hasLog && (
                <button role="tab" aria-selected={tab === "log"} onClick={() => setOutputTab("log")}>
                  Provisioning log
                </button>
              )}
            </div>
            {output && (
              <button className="secondary small-button" onClick={() => copyOutput(output)}>
                <Icon name="copy" size={15} /> Copy
              </button>
            )}
          </div>
          <pre tabIndex={0}>{output}</pre>
        </section>
      )}
    </div>
  );
}

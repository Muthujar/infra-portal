// Requests waiting for the logged-in approver's decision.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useConfirm } from "../components/ConfirmDialog";
import { APPROVALS_CHANGED } from "../components/Layout";
import { EmptyState, PageHeader, Skeleton } from "../components/Page";
import { useToast } from "../components/Toast";
import { formatDateTime, formatMemory, formatPlatform } from "../format";
import type { ServerRequest } from "../types";

function sizeText(request: ServerRequest): string {
  return request.cpu + " CPU · " + formatMemory(request.memoryMb) + " RAM · " + request.diskGb + " GB disk";
}

function leaseText(request: ServerRequest): string {
  return request.leaseDays ? request.leaseDays + " days" : "No expiry";
}

export function ApprovalsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, setPending] = useState<ServerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await api<ServerRequest[]>("/requests/pending-approvals");
      setPending(data);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(request: ServerRequest, decision: "approve" | "reject") {
    const approving = decision === "approve";
    const answer = await confirm({
      title: (approving ? "Approve " : "Reject ") + request.hostname + "?",
      message: approving
        ? "The server is created straight away."
        : request.requester.name + " will see your reason.",
      details: [
        { label: "Requested by", value: request.requester.name },
        { label: "Environment", value: request.environment },
        { label: "Size", value: sizeText(request) },
        { label: "Lease", value: leaseText(request) },
      ],
      warning: approving && request.environment === "PROD" ? "This is a production server." : undefined,
      confirmLabel: approving ? "Approve" : "Reject request",
      danger: !approving,
      input: approving
        ? { label: "Comment (optional)" }
        : { label: "Reason", placeholder: "Why is this request rejected?", minLength: 3 },
    });
    if (answer === null) {
      return;
    }

    setBusyId(request.id);
    try {
      await api("/requests/" + request.id + "/" + decision, "POST", { comment: answer || undefined });
      if (approving) {
        toast.success(request.hostname + " approved. The server is being created.");
      } else {
        toast.success(request.hostname + " rejected.");
      }
      await load();
      window.dispatchEvent(new Event(APPROVALS_CHANGED));
    } catch (err) {
      toast.error((err as Error).message);
    }
    setBusyId(null);
  }

  let subtitle = "Team leads approve DEV and QA requests of their team. Production requests need an admin.";
  if (pending.length > 0) {
    subtitle = pending.length + (pending.length === 1 ? " request is" : " requests are") + " waiting for you. " + subtitle;
  }

  return (
    <div>
      <PageHeader title="Approvals" subtitle={subtitle} />
      {error && <div className="notice notice-error">{error}</div>}
      {loading && <Skeleton rows={2} />}
      {!loading && pending.length === 0 && !error && (
        <EmptyState icon="checkCircle" title="You're all caught up" text="Nothing is waiting for your approval." />
      )}

      {pending.map((request) => (
        <article className="card approval" key={request.id}>
          <div className="approval-head">
            <div>
              <h3>
                <Link to={"/requests/" + request.id}>{request.hostname}</Link>
              </h3>
              <p className="muted small">
                #{request.id} · {request.requester.name} · {formatDateTime(request.createdAt)}
              </p>
            </div>
            <span className={"tag env-" + request.environment.toLowerCase()}>{request.environment}</span>
          </div>
          <dl className="approval-facts">
            <div>
              <dt>Server</dt>
              <dd>
                {request.catalogItem.name} ({formatPlatform(request.platform)})
              </dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{sizeText(request)}</dd>
            </div>
            <div>
              <dt>Lease</dt>
              <dd>{leaseText(request)}</dd>
            </div>
          </dl>
          <blockquote>{request.justification}</blockquote>
          <div className="approval-actions">
            <button className="secondary-danger" disabled={busyId !== null} onClick={() => decide(request, "reject")}>
              Reject
            </button>
            <button disabled={busyId !== null} onClick={() => decide(request, "approve")}>
              Approve
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

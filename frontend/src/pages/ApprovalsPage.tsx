// Requests waiting for the logged-in approver's decision.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useFeedback } from "../components/Feedback";
import { EmptyState, EnvTag, Loading, PageHeader, PlatformTag } from "../components/Ui";
import { formatMemory, timeAgo } from "../format";
import type { ServerRequest } from "../types";

export function ApprovalsPage() {
  const { confirm, toast } = useFeedback();
  const [pending, setPending] = useState<ServerRequest[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    try {
      const data = await api<ServerRequest[]>("/requests/pending-approvals");
      setPending(data);
    } catch (err) {
      setError((err as Error).message);
      setPending([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function summary(request: ServerRequest) {
    return (
      <p>
        <strong>{request.hostname}</strong> for {request.requester.name}: {request.catalogItem.name},{" "}
        {request.cpu} CPU, {formatMemory(request.memoryMb)} RAM, {request.diskGb} GB disk in <EnvTag env={request.environment} />
      </p>
    );
  }

  async function approve(request: ServerRequest) {
    const result = await confirm({
      title: "Approve this request?",
      message: (
        <>
          {summary(request)}
          <p className="muted">The server is created right away and counts against team {request.team.name}'s quota.</p>
        </>
      ),
      input: { label: "Comment", placeholder: "e.g. OK for the billing sprint" },
      confirmLabel: "Approve and create",
    });
    if (!result) {
      return;
    }
    await send(request, "approve", result.text);
  }

  async function reject(request: ServerRequest) {
    const result = await confirm({
      title: "Reject this request?",
      message: summary(request),
      input: { label: "Reason (shown to the requester)", placeholder: "e.g. Please use the shared QA server", required: true },
      confirmLabel: "Reject request",
      danger: true,
    });
    if (!result) {
      return;
    }
    await send(request, "reject", result.text);
  }

  async function send(request: ServerRequest, decision: "approve" | "reject", comment: string) {
    setError("");
    setBusyId(request.id);
    try {
      await api("/requests/" + request.id + "/" + decision, "POST", { comment: comment || undefined });
      toast(decision === "approve" ? request.hostname + " approved. The server is being created." : request.hostname + " rejected.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusyId(null);
  }

  return (
    <div>
      <PageHeader
        title="Approvals"
        subtitle="Team leads approve DEV and QA requests of their team. Production requests need an admin."
      />
      {error && <div className="error">{error}</div>}
      {pending === null && <Loading />}
      {pending !== null && pending.length === 0 && (
        <EmptyState icon="✅" title="All caught up">
          Nothing is waiting for your approval.
        </EmptyState>
      )}

      <div className="approval-list">
        {(pending || []).map((request) => (
          <div className="card approval" key={request.id}>
            <div className="approval-main">
              <div className="approval-title">
                <Link to={"/requests/" + request.id} className="row-title">
                  {request.hostname}
                </Link>
                <span className="muted small">#{request.id}</span>
                <EnvTag env={request.environment} />
                <PlatformTag platform={request.platform} />
              </div>
              <p className="approval-who">
                <strong>{request.requester.name}</strong> asked for a <strong>{request.catalogItem.name}</strong>{" "}
                <span className="muted">· {timeAgo(request.createdAt)}</span>
              </p>
              <div className="chips">
                <span className="chip">{request.cpu} CPU</span>
                <span className="chip">{formatMemory(request.memoryMb)} RAM</span>
                <span className="chip">{request.diskGb} GB disk</span>
                <span className="chip">Lease {request.leaseDays ? request.leaseDays + " days" : "none"}</span>
              </div>
              <blockquote className="reason">{request.justification}</blockquote>
            </div>
            <div className="approval-actions">
              <button onClick={() => approve(request)} disabled={busyId === request.id}>
                Approve
              </button>
              <button className="danger-outline" onClick={() => reject(request)} disabled={busyId === request.id}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

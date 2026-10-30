// Requests waiting for the logged-in approver's decision.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { ServerRequest } from "../types";

export function ApprovalsPage() {
  const [pending, setPending] = useState<ServerRequest[]>([]);
  const [comments, setComments] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const data = await api<ServerRequest[]>("/requests/pending-approvals");
      setPending(data);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function setComment(requestId: number, text: string) {
    const updated = { ...comments };
    updated[requestId] = text;
    setComments(updated);
  }

  async function decide(request: ServerRequest, decision: "approve" | "reject") {
    setError("");
    setMessage("");
    try {
      await api("/requests/" + request.id + "/" + decision, "POST", {
        comment: comments[request.id] || undefined,
      });
      if (decision === "approve") {
        setMessage(request.hostname + " approved. The server is being created.");
      } else {
        setMessage(request.hostname + " rejected.");
      }
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <h1>Approvals</h1>
      <p className="muted">Team leads approve DEV and QA requests of their team. Production requests need an admin.</p>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
      {pending.length === 0 && <p className="muted">Nothing is waiting for your approval.</p>}

      {pending.map((request) => (
        <div className="card approval" key={request.id}>
          <div className="title-row">
            <h3>
              <Link to={"/requests/" + request.id}>
                #{request.id} {request.hostname}
              </Link>
            </h3>
            <span className={"env env-" + request.environment.toLowerCase()}>{request.environment}</span>
          </div>
          <p>
            <strong>{request.requester.name}</strong> wants a <strong>{request.catalogItem.name}</strong> ({request.platform},{" "}
            {request.cpu} CPU, {request.memoryMb} MB RAM, {request.diskGb} GB disk)
          </p>
          <p className="muted">
            Reason: {request.justification} · Lease: {request.leaseDays ? request.leaseDays + " days" : "no expiry"}
          </p>
          <input
            placeholder="Comment (required when rejecting)"
            value={comments[request.id] || ""}
            onChange={(e) => setComment(request.id, e.target.value)}
          />
          <div className="actions">
            <button className="danger" onClick={() => decide(request, "reject")}>
              Reject
            </button>
            <button onClick={() => decide(request, "approve")}>Approve</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// The service catalog: pick a server type, fill the form, submit the request.

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { EmptyState, PageHeader, Skeleton } from "../components/Page";
import { QuotaCard } from "../components/QuotaBar";
import { useToast } from "../components/Toast";
import { formatMemory, formatPlatform } from "../format";
import type { CatalogItem, Environment, Platform, QuotaUsage, ServerRequest } from "../types";

// The same rule the API checks.
const HOSTNAME_PATTERN = /^[a-z][a-z0-9-]{2,29}$/;
const MIN_REASON = 5;
const ENVIRONMENTS: Environment[] = ["DEV", "QA", "PROD"];

function leaseText(leaseDays: string): string {
  return leaseDays === "" ? "No expiry" : leaseDays + " days";
}

function sizeText(item: CatalogItem): string {
  return item.cpu + " CPU · " + formatMemory(item.memoryMb) + " RAM · " + item.diskGb + " GB disk";
}

export function CatalogPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<QuotaUsage | null>(null);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [platform, setPlatform] = useState<Platform | "ALL">("ALL");
  const [mockMode, setMockMode] = useState(false);
  const [error, setError] = useState("");

  // Form fields
  const [hostname, setHostname] = useState("");
  const [environment, setEnvironment] = useState<Environment>("DEV");
  const [justification, setJustification] = useState("");
  const [leaseDays, setLeaseDays] = useState("30"); // "" means no expiry
  const [hostnameTouched, setHostnameTouched] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const catalog = await api<CatalogItem[]>("/catalog");
        setItems(catalog);
        const quotas = await api<QuotaUsage[]>("/teams/quota");
        // Admins get every team back, so pick their own.
        const own = quotas.find((usage) => usage.teamId === user?.teamId);
        setQuota(own || quotas[0] || null);
      } catch (err) {
        setError((err as Error).message);
      }
      setLoading(false);
    }
    load();

    // The "fail" hostname tip only applies when provisioning is simulated.
    api<{ provisioner: string }>("/health")
      .then((health) => setMockMode(health.provisioner === "mock"))
      .catch(() => setMockMode(false));
  }, [user?.teamId]);

  function openForm(item: CatalogItem) {
    setSelected(item);
    setHostname("");
    setEnvironment("DEV");
    setJustification("");
    setLeaseDays("30");
    setHostnameTouched(false);
    setFormError("");
  }

  // Closing the form loses what was typed, so ask first if anything was.
  async function closeForm() {
    if (hostname !== "" || justification !== "") {
      const answer = await confirm({
        title: "Discard this request?",
        message: "What you typed will be lost.",
        confirmLabel: "Discard",
        danger: true,
      });
      if (answer === null) {
        return;
      }
    }
    setSelected(null);
  }

  // Warn early if the request would not fit in the team's quota. The API has the final say.
  function quotaWarning(item: CatalogItem): string {
    if (!quota) {
      return "";
    }
    const tooMuch: string[] = [];
    if (quota.cpu.used + item.cpu > quota.cpu.limit) tooMuch.push("CPU");
    if (quota.memoryMb.used + item.memoryMb > quota.memoryMb.limit) tooMuch.push("memory");
    if (quota.diskGb.used + item.diskGb > quota.diskGb.limit) tooMuch.push("disk");
    if (tooMuch.length === 0) {
      return "";
    }
    return "This server would go over your team's " + tooMuch.join(", ") + " quota, so the request may be refused.";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      return;
    }
    setHostnameTouched(true);
    if (!HOSTNAME_PATTERN.test(hostname)) {
      return;
    }

    const approver = environment === "PROD" ? "an admin" : "your team lead";
    const answer = await confirm({
      title: "Submit this request?",
      message: "It will go to " + approver + " for approval.",
      details: [
        { label: "Server", value: selected.name },
        { label: "Hostname", value: hostname },
        { label: "Environment", value: environment },
        { label: "Size", value: sizeText(selected) },
        { label: "Lease", value: leaseText(leaseDays) },
      ],
      confirmLabel: "Submit request",
    });
    if (answer === null) {
      return;
    }

    setFormError("");
    setSubmitting(true);
    try {
      const created = await api<ServerRequest>("/requests", "POST", {
        catalogItemId: selected.id,
        hostname: hostname,
        environment: environment,
        justification: justification.trim(),
        leaseDays: leaseDays === "" ? null : Number(leaseDays),
      });
      toast.success("Request for " + hostname + " submitted.");
      navigate("/requests/" + created.id);
    } catch (err) {
      setFormError((err as Error).message);
    }
    setSubmitting(false);
  }

  const shown = items.filter((item) => platform === "ALL" || item.platform === platform);
  const hostnameInvalid = hostnameTouched && !HOSTNAME_PATTERN.test(hostname);
  const reasonReady = justification.trim().length >= MIN_REASON;

  return (
    <div>
      <PageHeader
        title="Service catalog"
        subtitle="Choose the server you need. Your team lead approves it, then it is created automatically."
      />
      {error && <div className="notice notice-error">{error}</div>}

      <div className="segmented" role="group" aria-label="Filter by platform">
        {(["ALL", "PROXMOX", "AWS"] as const).map((option) => (
          <button
            key={option}
            className={platform === option ? "active" : ""}
            aria-pressed={platform === option}
            onClick={() => setPlatform(option)}
          >
            {option === "ALL" ? "All" : formatPlatform(option)}
          </button>
        ))}
      </div>

      <div className="catalog-layout">
        <div>
          {loading && <Skeleton rows={3} />}
          {!loading && shown.length === 0 && (
            <EmptyState title="No servers available" text="Nothing in the catalog matches this filter." />
          )}
          <div className="catalog-grid">
            {shown.map((item) => (
              <article className="card catalog-item" key={item.id}>
                <div className="catalog-top">
                  <span className="catalog-icon">
                    <Icon name="server" size={20} />
                  </span>
                  <span className={"tag platform-" + item.platform.toLowerCase()}>{formatPlatform(item.platform)}</span>
                </div>
                <h3>{item.name}</h3>
                <p className="muted small">{item.description}</p>
                <dl className="specs">
                  <div>
                    <dt>CPU</dt>
                    <dd>{item.cpu}</dd>
                  </div>
                  <div>
                    <dt>RAM</dt>
                    <dd>{formatMemory(item.memoryMb)}</dd>
                  </div>
                  <div>
                    <dt>Disk</dt>
                    <dd>{item.diskGb} GB</dd>
                  </div>
                </dl>
                <p className="muted small">
                  {item.osName}
                  {item.awsInstanceType && " · " + item.awsInstanceType}
                </p>
                <button className="block" onClick={() => openForm(item)}>
                  Request server
                </button>
              </article>
            ))}
          </div>
        </div>
        <aside className="catalog-aside">{quota && <QuotaCard usage={quota} />}</aside>
      </div>

      {selected && (
        <Modal title={"Request " + selected.name} onClose={closeForm} size="large">
          <form onSubmit={handleSubmit} noValidate>
            <div className="modal-title">
              <div>
                <h2>Request {selected.name}</h2>
                <p className="muted small">
                  {formatPlatform(selected.platform)} · {sizeText(selected)}
                </p>
              </div>
              <button type="button" className="icon-button" aria-label="Close" onClick={closeForm}>
                <Icon name="x" />
              </button>
            </div>

            <label>
              Hostname
              <input
                data-autofocus
                value={hostname}
                onChange={(e) => setHostname(e.target.value.toLowerCase())}
                onBlur={() => setHostnameTouched(hostname !== "")}
                placeholder="billing-api-01"
                aria-invalid={hostnameInvalid}
                autoComplete="off"
                spellCheck={false}
              />
              {hostnameInvalid ? (
                <small className="field-error">Use 3-30 lowercase letters, numbers or "-", starting with a letter.</small>
              ) : (
                <small className="muted">
                  Lowercase letters, numbers and "-".
                  {mockMode && ' Tip: a name with "fail" simulates a failure.'}
                </small>
              )}
            </label>

            <fieldset>
              <legend>Environment</legend>
              <div className="segmented" role="group" aria-label="Environment">
                {ENVIRONMENTS.map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={environment === option ? "active" : ""}
                    aria-pressed={environment === option}
                    onClick={() => setEnvironment(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {environment === "PROD" && (
                <small className="muted">Production requests need an admin to approve them.</small>
              )}
            </fieldset>

            <label>
              Lease
              <select value={leaseDays} onChange={(e) => setLeaseDays(e.target.value)}>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="">No expiry</option>
              </select>
              <small className="muted">The server is deleted automatically when the lease ends. You can extend it.</small>
            </label>

            <label>
              Why do you need it?
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="API server for the new billing service"
              />
              <small className="muted">{justification.length} of 500 characters, at least {MIN_REASON}.</small>
            </label>

            {quotaWarning(selected) && <div className="notice notice-warn">{quotaWarning(selected)}</div>}
            {formError && (
              <div className="notice notice-error" role="alert">
                {formError}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeForm}>
                Cancel
              </button>
              <button type="submit" disabled={submitting || hostname === "" || !reasonReady}>
                {submitting ? "Submitting..." : "Review and submit"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

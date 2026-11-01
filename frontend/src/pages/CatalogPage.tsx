// The service catalog: pick a server type, fill the form, submit the request.

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useFeedback } from "../components/Feedback";
import { QuotaCard } from "../components/QuotaBar";
import { EmptyState, EnvTag, Loading, PageHeader, PlatformTag } from "../components/Ui";
import { formatMemory } from "../format";
import type { CatalogItem, Environment, QuotaUsage, ServerRequest } from "../types";

// Same rule as the API: 3-30 characters, lowercase letters, numbers or "-", starting with a letter.
const HOSTNAME_PATTERN = /^[a-z][a-z0-9-]{2,29}$/;

export function CatalogPage() {
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [quota, setQuota] = useState<QuotaUsage | null>(null);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [error, setError] = useState("");

  // Form fields
  const [hostname, setHostname] = useState("");
  const [environment, setEnvironment] = useState<Environment>("DEV");
  const [justification, setJustification] = useState("");
  const [leaseDays, setLeaseDays] = useState("30"); // "" means no expiry
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const catalog = await api<CatalogItem[]>("/catalog");
        setItems(catalog);
        const quotas = await api<QuotaUsage[]>("/teams/quota");
        if (quotas.length > 0) {
          setQuota(quotas[0]);
        }
      } catch (err) {
        setError((err as Error).message);
        setItems([]);
      }
    }
    load();
  }, []);

  function openForm(item: CatalogItem) {
    setSelected(item);
    setHostname("");
    setEnvironment("DEV");
    setJustification("");
    setLeaseDays("30");
    setFormError("");
  }

  // Closing a half-filled form asks first, so typed text is not lost by a stray click.
  async function closeForm() {
    const hasChanges = hostname !== "" || justification !== "";
    if (hasChanges) {
      const ok = await confirm({
        title: "Discard this request?",
        message: "What you typed in the form will be lost.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        danger: true,
      });
      if (!ok) {
        return;
      }
    }
    setSelected(null);
  }

  // Only complain once there is something to judge, so the field is not red while typing "a".
  const hostnameInvalid =
    hostname !== "" && (hostname.length >= 3 || /[^a-z0-9-]/.test(hostname) || !/^[a-z]/.test(hostname)) && !HOSTNAME_PATTERN.test(hostname);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !HOSTNAME_PATTERN.test(hostname)) {
      setFormError("Hostname: use 3-30 lowercase letters, numbers or \"-\", starting with a letter.");
      return;
    }

    const leaseText = leaseDays === "" ? "no expiry" : leaseDays + " days";
    const ok = await confirm({
      title: "Submit this request?",
      message: (
        <>
          <p>
            <strong>{hostname}</strong> · {selected.name} in <EnvTag env={environment} />
          </p>
          <p className="muted">
            {selected.cpu} CPU · {formatMemory(selected.memoryMb)} RAM · {selected.diskGb} GB disk · lease {leaseText}
          </p>
          <p className="muted">
            {environment === "PROD"
              ? "Production requests are approved by an admin."
              : "Your team lead will be asked to approve it."}
          </p>
        </>
      ),
      confirmLabel: "Submit request",
    });
    if (!ok) {
      return;
    }

    setFormError("");
    setSubmitting(true);
    try {
      const created = await api<ServerRequest>("/requests", "POST", {
        catalogItemId: selected.id,
        hostname: hostname,
        environment: environment,
        justification: justification,
        leaseDays: leaseDays === "" ? null : Number(leaseDays),
      });
      toast("Request #" + created.id + " submitted for approval");
      navigate("/requests/" + created.id);
    } catch (err) {
      setFormError((err as Error).message);
    }
    setSubmitting(false);
  }

  return (
    <div>
      <PageHeader
        title="Service catalog"
        subtitle="Choose the server you need. Your team lead approves it, then it is created automatically."
      />
      {error && <div className="error">{error}</div>}

      <div className="catalog-layout">
        <div>
          {items === null && <Loading />}
          {items !== null && items.length === 0 && !error && (
            <EmptyState icon="🗂" title="The catalog is empty">
              An admin can enable server types on the Admin page.
            </EmptyState>
          )}
          <div className="catalog-grid">
            {(items || []).map((item) => (
              <div className="card catalog-item" key={item.id}>
                <div className="catalog-item-top">
                  <PlatformTag platform={item.platform} />
                  <span className="muted small">{item.osName}</span>
                </div>
                <h3>{item.name}</h3>
                <p className="muted catalog-desc">{item.description}</p>
                <div className="spec-row">
                  <div>
                    <strong>{item.cpu}</strong>
                    <span>CPU</span>
                  </div>
                  <div>
                    <strong>{formatMemory(item.memoryMb)}</strong>
                    <span>RAM</span>
                  </div>
                  <div>
                    <strong>{item.diskGb} GB</strong>
                    <span>Disk</span>
                  </div>
                </div>
                {item.awsInstanceType && <p className="muted small">Instance type {item.awsInstanceType}</p>}
                <button onClick={() => openForm(item)}>Request this server</button>
              </div>
            ))}
          </div>
        </div>
        <aside className="catalog-aside">
          {quota && <QuotaCard usage={quota} />}
          <div className="card help-card">
            <h3>How it works</h3>
            <ol className="how-list">
              <li>Pick a server and say why you need it.</li>
              <li>Your team lead approves it (admins approve PROD).</li>
              <li>The portal creates it with Terraform and sets it up.</li>
              <li>It is deleted when the lease ends, unless you extend it.</li>
            </ol>
          </div>
        </aside>
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={closeForm}>
          <form
            className="card modal"
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-title"
          >
            <div className="modal-head">
              <div>
                <h2 id="request-title">Request {selected.name}</h2>
                <p className="muted small">
                  {selected.platform === "AWS" ? "AWS" : "Proxmox"} · {selected.cpu} CPU · {formatMemory(selected.memoryMb)} RAM ·{" "}
                  {selected.diskGb} GB disk
                </p>
              </div>
              <button type="button" className="icon-button" aria-label="Close" onClick={closeForm}>
                ×
              </button>
            </div>

            <label>
              Hostname
              <input
                value={hostname}
                onChange={(e) => setHostname(e.target.value.toLowerCase().replace(/\s/g, "-"))}
                placeholder="e.g. billing-api-01"
                className={hostnameInvalid ? "invalid" : ""}
                autoFocus
                required
              />
              {hostnameInvalid ? (
                <small className="field-error">Use 3-30 lowercase letters, numbers or "-", starting with a letter.</small>
              ) : (
                <small className="muted">Lowercase letters, numbers and "-". Tip: a name with "fail" simulates a failure in mock mode.</small>
              )}
            </label>

            <div className="form-row">
              <label>
                Environment
                <select value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)}>
                  <option value="DEV">DEV</option>
                  <option value="QA">QA</option>
                  <option value="PROD">PROD (needs admin approval)</option>
                </select>
              </label>

              <label>
                Lease
                <select value={leaseDays} onChange={(e) => setLeaseDays(e.target.value)}>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="">No expiry</option>
                </select>
              </label>
            </div>
            <p className="muted small form-hint">The server is deleted automatically when the lease ends. You can extend it.</p>

            <label>
              Why do you need it?
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={3}
                placeholder="e.g. API server for the new billing service"
                required
              />
            </label>

            {formError && <div className="error">{formError}</div>}

            <div className="actions">
              <button type="button" className="secondary" onClick={closeForm}>
                Cancel
              </button>
              <button type="submit" disabled={submitting || hostnameInvalid}>
                {submitting ? "Submitting..." : "Review and submit"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

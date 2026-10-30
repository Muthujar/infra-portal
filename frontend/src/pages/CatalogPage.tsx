// The service catalog: pick a server type, fill the form, submit the request.

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { QuotaCard } from "../components/QuotaBar";
import type { CatalogItem, Environment, QuotaUsage, ServerRequest } from "../types";

export function CatalogPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [quota, setQuota] = useState<QuotaUsage | null>(null);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [error, setError] = useState("");

  // Form fields
  const [hostname, setHostname] = useState("");
  const [environment, setEnvironment] = useState<Environment>("DEV");
  const [justification, setJustification] = useState("");
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
      }
    }
    load();
  }, []);

  function openForm(item: CatalogItem) {
    setSelected(item);
    setHostname("");
    setEnvironment("DEV");
    setJustification("");
    setFormError("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
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
      });
      navigate("/requests/" + created.id);
    } catch (err) {
      setFormError((err as Error).message);
    }
    setSubmitting(false);
  }

  return (
    <div>
      <h1>Service catalog</h1>
      <p className="muted">Choose the server you need. Your team lead approves it, then it is created automatically.</p>
      {error && <div className="error">{error}</div>}

      <div className="catalog-layout">
        <div className="catalog-grid">
          {items.map((item) => (
            <div className="card catalog-item" key={item.id}>
              <span className={"platform platform-" + item.platform.toLowerCase()}>{item.platform}</span>
              <h3>{item.name}</h3>
              <p className="muted">{item.description}</p>
              <ul className="specs">
                <li>{item.cpu} CPU</li>
                <li>{item.memoryMb / 1024} GB RAM</li>
                <li>{item.diskGb} GB disk</li>
                <li>{item.osName}</li>
                {item.awsInstanceType && <li>{item.awsInstanceType}</li>}
              </ul>
              <button onClick={() => openForm(item)}>Request</button>
            </div>
          ))}
        </div>
        <aside>{quota && <QuotaCard usage={quota} />}</aside>
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <form className="card modal" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
            <h2>Request: {selected.name}</h2>
            <p className="muted">
              {selected.platform} · {selected.cpu} CPU · {selected.memoryMb} MB RAM · {selected.diskGb} GB disk
            </p>

            <label>
              Hostname
              <input
                value={hostname}
                onChange={(e) => setHostname(e.target.value.toLowerCase())}
                placeholder="e.g. billing-api-01"
                required
              />
              <small className="muted">Lowercase letters, numbers and "-". Tip: a name with "fail" simulates a failure in mock mode.</small>
            </label>

            <label>
              Environment
              <select value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)}>
                <option value="DEV">DEV</option>
                <option value="QA">QA</option>
                <option value="PROD">PROD (needs admin approval)</option>
              </select>
            </label>

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
              <button type="button" className="secondary" onClick={() => setSelected(null)}>
                Cancel
              </button>
              <button type="submit" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit request"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

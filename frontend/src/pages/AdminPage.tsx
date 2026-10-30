// Admin screen: team quotas, catalog items and the audit log.

import { useEffect, useState } from "react";
import { api } from "../api";
import { QuotaCard } from "../components/QuotaBar";
import type { AuditEvent, CatalogItem, QuotaUsage } from "../types";

interface QuotaForm {
  cpuQuota: number;
  memoryQuotaMb: number;
  diskQuotaGb: number;
}

export function AdminPage() {
  const [quotas, setQuotas] = useState<QuotaUsage[]>([]);
  const [forms, setForms] = useState<Record<number, QuotaForm>>({});
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const quotaData = await api<QuotaUsage[]>("/teams/quota");
      setQuotas(quotaData);

      // Fill the edit forms with the current limits.
      const newForms: Record<number, QuotaForm> = {};
      for (const usage of quotaData) {
        newForms[usage.teamId] = {
          cpuQuota: usage.cpu.limit,
          memoryQuotaMb: usage.memoryMb.limit,
          diskQuotaGb: usage.diskGb.limit,
        };
      }
      setForms(newForms);

      setCatalog(await api<CatalogItem[]>("/catalog?all=true"));
      setAudit(await api<AuditEvent[]>("/audit"));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function updateForm(teamId: number, field: keyof QuotaForm, value: string) {
    const updated = { ...forms };
    updated[teamId] = { ...updated[teamId], [field]: Number(value) };
    setForms(updated);
  }

  async function saveQuota(teamId: number) {
    setError("");
    setMessage("");
    try {
      await api("/teams/" + teamId + "/quota", "PUT", forms[teamId]);
      setMessage("Quota saved");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleItem(item: CatalogItem) {
    setError("");
    try {
      await api("/catalog/" + item.id, "PATCH", { active: !item.active });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <h1>Admin</h1>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <h2>Team quotas</h2>
      <div className="quota-grid">
        {quotas.map((usage) => {
          const form = forms[usage.teamId];
          return (
            <div key={usage.teamId}>
              <QuotaCard usage={usage} />
              {form && (
                <div className="card quota-form">
                  <label>
                    CPU cores
                    <input type="number" value={form.cpuQuota} onChange={(e) => updateForm(usage.teamId, "cpuQuota", e.target.value)} />
                  </label>
                  <label>
                    Memory (MB)
                    <input type="number" value={form.memoryQuotaMb} onChange={(e) => updateForm(usage.teamId, "memoryQuotaMb", e.target.value)} />
                  </label>
                  <label>
                    Disk (GB)
                    <input type="number" value={form.diskQuotaGb} onChange={(e) => updateForm(usage.teamId, "diskQuotaGb", e.target.value)} />
                  </label>
                  <button onClick={() => saveQuota(usage.teamId)}>Save quota</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h2>Catalog items</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Platform</th>
            <th>Size</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {catalog.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{item.platform}</td>
              <td>
                {item.cpu} CPU · {item.memoryMb} MB · {item.diskGb} GB
              </td>
              <td>{item.active ? "Active" : "Disabled"}</td>
              <td>
                <button className="secondary" onClick={() => toggleItem(item)}>
                  {item.active ? "Disable" : "Enable"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Audit log</h2>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Who</th>
            <th>Action</th>
            <th>Server</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {audit.map((event) => (
            <tr key={event.id}>
              <td className="nowrap">{new Date(event.createdAt).toLocaleString()}</td>
              <td>{event.actor ? event.actor.name : "System"}</td>
              <td>{event.action}</td>
              <td>{event.request ? event.request.hostname : "-"}</td>
              <td>{event.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

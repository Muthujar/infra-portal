// Admin screen: team quotas, catalog items and the audit log.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useFeedback } from "../components/Feedback";
import { QuotaBars } from "../components/QuotaBar";
import { EmptyState, Loading, PageHeader, PlatformTag } from "../components/Ui";
import { formatMemory, timeAgo } from "../format";
import type { AuditEvent, CatalogItem, QuotaUsage } from "../types";

interface QuotaForm {
  cpuQuota: number;
  memoryQuotaMb: number;
  diskQuotaGb: number;
}

type Tab = "quotas" | "catalog" | "audit";

function formFrom(usage: QuotaUsage): QuotaForm {
  return { cpuQuota: usage.cpu.limit, memoryQuotaMb: usage.memoryMb.limit, diskQuotaGb: usage.diskGb.limit };
}

export function AdminPage() {
  const { confirm, toast } = useFeedback();
  const [tab, setTab] = useState<Tab>("quotas");
  const [quotas, setQuotas] = useState<QuotaUsage[] | null>(null);
  const [editing, setEditing] = useState<number | null>(null); // team id being edited
  const [form, setForm] = useState<QuotaForm | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [auditSearch, setAuditSearch] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      setQuotas(await api<QuotaUsage[]>("/teams/quota"));
      setCatalog(await api<CatalogItem[]>("/catalog?all=true"));
      setAudit(await api<AuditEvent[]>("/audit"));
    } catch (err) {
      setError((err as Error).message);
      setQuotas([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(usage: QuotaUsage) {
    setEditing(usage.teamId);
    setForm(formFrom(usage));
  }

  function updateForm(field: keyof QuotaForm, value: string) {
    if (form) {
      setForm({ ...form, [field]: Number(value) });
    }
  }

  async function saveQuota(usage: QuotaUsage) {
    if (!form) return;
    const old = formFrom(usage);
    const rows: { label: string; from: number; to: number; used: number; unit: string }[] = [
      { label: "CPU", from: old.cpuQuota, to: form.cpuQuota, used: usage.cpu.used, unit: "cores" },
      { label: "Memory", from: old.memoryQuotaMb, to: form.memoryQuotaMb, used: usage.memoryMb.used, unit: "MB" },
      { label: "Disk", from: old.diskQuotaGb, to: form.diskQuotaGb, used: usage.diskGb.used, unit: "GB" },
    ];
    const changed = rows.filter((r) => r.from !== r.to);
    if (changed.length === 0) {
      setEditing(null);
      return;
    }
    const belowUse = changed.some((r) => r.to < r.used);

    const ok = await confirm({
      title: "Change team " + usage.teamName + "'s quota?",
      message: (
        <>
          <ul className="change-list">
            {changed.map((r) => (
              <li key={r.label}>
                {r.label}: <s className="muted">{r.from}</s> → <strong>{r.to}</strong> {r.unit}
              </li>
            ))}
          </ul>
          {belowUse && (
            <p className="field-error">
              A new limit is lower than what the team already uses. Their servers keep running, but new requests will be blocked.
            </p>
          )}
        </>
      ),
      confirmLabel: "Save quota",
      danger: belowUse,
    });
    if (!ok) return;

    setError("");
    try {
      await api("/teams/" + usage.teamId + "/quota", "PUT", form);
      toast("Quota for " + usage.teamName + " saved");
      setEditing(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleItem(item: CatalogItem) {
    const ok = await confirm({
      title: (item.active ? "Disable " : "Enable ") + item.name + "?",
      message: item.active
        ? "Users will no longer see it in the catalog. Servers already created from it are not affected."
        : "Users will be able to request it from the catalog again.",
      confirmLabel: item.active ? "Disable" : "Enable",
      danger: item.active,
    });
    if (!ok) return;

    setError("");
    try {
      await api("/catalog/" + item.id, "PATCH", { active: !item.active });
      toast(item.name + (item.active ? " disabled" : " enabled"));
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const query = auditSearch.trim().toLowerCase();
  const shownAudit = audit.filter(
    (e) =>
      query === "" ||
      e.message.toLowerCase().includes(query) ||
      e.action.toLowerCase().includes(query) ||
      (e.request?.hostname || "").includes(query) ||
      (e.actor?.name || "system").toLowerCase().includes(query)
  );

  return (
    <div>
      <PageHeader title="Admin" subtitle="Team quotas, the service catalog and the audit log." />
      {error && <div className="error">{error}</div>}

      <div className="tabs page-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "quotas"} className={"tab" + (tab === "quotas" ? " active" : "")} onClick={() => setTab("quotas")}>
          Team quotas
        </button>
        <button role="tab" aria-selected={tab === "catalog"} className={"tab" + (tab === "catalog" ? " active" : "")} onClick={() => setTab("catalog")}>
          Catalog items <span className="tab-count">{catalog.length}</span>
        </button>
        <button role="tab" aria-selected={tab === "audit"} className={"tab" + (tab === "audit" ? " active" : "")} onClick={() => setTab("audit")}>
          Audit log <span className="tab-count">{audit.length}</span>
        </button>
      </div>

      {quotas === null && <Loading />}

      {tab === "quotas" && quotas !== null && (
        <div className="quota-grid">
          {quotas.map((usage) => {
            const isEditing = editing === usage.teamId && form !== null;
            return (
              <div className="card quota-card" key={usage.teamId}>
                <div className="card-title">
                  <h3>Team {usage.teamName}</h3>
                  {!isEditing && (
                    <button className="secondary small-button" onClick={() => startEdit(usage)}>
                      Edit limits
                    </button>
                  )}
                </div>
                <QuotaBars usage={usage} />
                {isEditing && form && (
                  <div className="quota-form">
                    <div className="form-row three">
                      <label>
                        CPU cores
                        <input type="number" min={0} value={form.cpuQuota} onChange={(e) => updateForm("cpuQuota", e.target.value)} />
                      </label>
                      <label>
                        Memory (MB)
                        <input type="number" min={0} step={512} value={form.memoryQuotaMb} onChange={(e) => updateForm("memoryQuotaMb", e.target.value)} />
                      </label>
                      <label>
                        Disk (GB)
                        <input type="number" min={0} value={form.diskQuotaGb} onChange={(e) => updateForm("diskQuotaGb", e.target.value)} />
                      </label>
                    </div>
                    <div className="actions">
                      <button className="secondary" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                      <button onClick={() => saveQuota(usage)}>Save quota</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "catalog" && (
        <div className="table-wrap">
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
                <tr key={item.id} className={item.active ? "" : "row-disabled"}>
                  <td>
                    <strong>{item.name}</strong>
                    <div className="muted small">{item.osName}</div>
                  </td>
                  <td>
                    <PlatformTag platform={item.platform} />
                  </td>
                  <td className="nowrap">
                    {item.cpu} CPU · {formatMemory(item.memoryMb)} · {item.diskGb} GB
                  </td>
                  <td>
                    <span className={"badge " + (item.active ? "badge-completed" : "badge-decommissioned")}>
                      <span className="badge-dot" aria-hidden="true" />
                      {item.active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="cell-actions">
                    <button className={item.active ? "danger-outline small-button" : "secondary small-button"} onClick={() => toggleItem(item)}>
                      {item.active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "audit" && (
        <>
          <div className="toolbar">
            <p className="muted small">Every change to every request, newest first.</p>
            <input
              className="search"
              type="search"
              placeholder="Search server, person or text"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
            />
          </div>
          {audit.length === 0 ? (
            <EmptyState icon="📜" title="No events yet" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Server</th>
                    <th>What happened</th>
                  </tr>
                </thead>
                <tbody>
                  {shownAudit.map((event) => (
                    <tr key={event.id}>
                      <td className="nowrap" title={new Date(event.createdAt).toLocaleString()}>
                        {timeAgo(event.createdAt)}
                      </td>
                      <td className="nowrap">{event.actor ? event.actor.name : <span className="muted">System</span>}</td>
                      <td className="nowrap">
                        {event.request && event.requestId ? (
                          <Link to={"/requests/" + event.requestId}>{event.request.hostname}</Link>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td>
                        <span className="action-tag">{event.action.replace(/_/g, " ").toLowerCase()}</span> {event.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shownAudit.length === 0 && <p className="muted table-empty">No events match your search.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

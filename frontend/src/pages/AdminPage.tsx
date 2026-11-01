// Admin screen: team quotas, catalog items and the audit log.

import { useEffect, useState } from "react";
import { api } from "../api";
import { useConfirm } from "../components/ConfirmDialog";
import { EmptyState, PageHeader, Skeleton } from "../components/Page";
import { QuotaBars } from "../components/QuotaBar";
import { useToast } from "../components/Toast";
import { formatDateTime, formatMemory, formatPlatform } from "../format";
import type { AuditEvent, CatalogItem, QuotaUsage } from "../types";

interface QuotaForm {
  cpuQuota: string;
  memoryQuotaMb: string;
  diskQuotaGb: string;
}

type AdminTab = "quotas" | "catalog" | "audit";

const ACTION_LABELS: Record<string, string> = {
  REQUEST_CREATED: "Request created",
  STATUS_CHANGED: "Status changed",
  QUOTA_CHANGED: "Quota changed",
  LEASE_EXTENDED: "Lease extended",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}

// Whole numbers from 0 up, the same rule the API checks.
function isValidAmount(value: string): boolean {
  return /^\d+$/.test(value);
}

export function AdminPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const [tab, setTab] = useState<AdminTab>("quotas");
  const [quotas, setQuotas] = useState<QuotaUsage[]>([]);
  const [forms, setForms] = useState<Record<number, QuotaForm>>({});
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const quotaData = await api<QuotaUsage[]>("/teams/quota");
      setQuotas(quotaData);

      // Fill the edit forms with the current limits.
      const newForms: Record<number, QuotaForm> = {};
      for (const usage of quotaData) {
        newForms[usage.teamId] = {
          cpuQuota: String(usage.cpu.limit),
          memoryQuotaMb: String(usage.memoryMb.limit),
          diskQuotaGb: String(usage.diskGb.limit),
        };
      }
      setForms(newForms);

      setCatalog(await api<CatalogItem[]>("/catalog?all=true"));
      setAudit(await api<AuditEvent[]>("/audit"));
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function updateForm(teamId: number, field: keyof QuotaForm, value: string) {
    const updated = { ...forms };
    updated[teamId] = { ...updated[teamId], [field]: value };
    setForms(updated);
  }

  function isChanged(usage: QuotaUsage, form: QuotaForm): boolean {
    return (
      form.cpuQuota !== String(usage.cpu.limit) ||
      form.memoryQuotaMb !== String(usage.memoryMb.limit) ||
      form.diskQuotaGb !== String(usage.diskGb.limit)
    );
  }

  function isValid(form: QuotaForm): boolean {
    return isValidAmount(form.cpuQuota) && isValidAmount(form.memoryQuotaMb) && isValidAmount(form.diskQuotaGb);
  }

  function resetForm(usage: QuotaUsage) {
    setForms((current) => ({
      ...current,
      [usage.teamId]: {
        cpuQuota: String(usage.cpu.limit),
        memoryQuotaMb: String(usage.memoryMb.limit),
        diskQuotaGb: String(usage.diskGb.limit),
      },
    }));
  }

  async function saveQuota(usage: QuotaUsage) {
    const form = forms[usage.teamId];
    const belowUse =
      Number(form.cpuQuota) < usage.cpu.used ||
      Number(form.memoryQuotaMb) < usage.memoryMb.used ||
      Number(form.diskQuotaGb) < usage.diskGb.used;

    const answer = await confirm({
      title: "Save quota for " + usage.teamName + "?",
      details: [
        { label: "CPU", value: usage.cpu.limit + " → " + form.cpuQuota + " cores" },
        {
          label: "Memory",
          value: formatMemory(usage.memoryMb.limit) + " → " + formatMemory(Number(form.memoryQuotaMb)),
        },
        { label: "Disk", value: usage.diskGb.limit + " → " + form.diskQuotaGb + " GB" },
      ],
      warning: belowUse
        ? "The new limit is below what this team uses now. Running servers keep working, but new requests are refused."
        : undefined,
      confirmLabel: "Save quota",
    });
    if (answer === null) {
      return;
    }

    setBusy(true);
    try {
      await api("/teams/" + usage.teamId + "/quota", "PUT", {
        cpuQuota: Number(form.cpuQuota),
        memoryQuotaMb: Number(form.memoryQuotaMb),
        diskQuotaGb: Number(form.diskQuotaGb),
      });
      toast.success("Quota for " + usage.teamName + " saved.");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setBusy(false);
  }

  async function toggleItem(item: CatalogItem) {
    const disabling = item.active;
    const answer = await confirm({
      title: (disabling ? "Disable " : "Enable ") + item.name + "?",
      message: disabling
        ? "People can no longer request it. Servers that already exist keep running."
        : "People can request it from the catalog again.",
      confirmLabel: disabling ? "Disable" : "Enable",
      danger: disabling,
    });
    if (answer === null) {
      return;
    }

    setBusy(true);
    try {
      await api("/catalog/" + item.id, "PATCH", { active: !item.active });
      toast.success(item.name + (disabling ? " disabled." : " enabled."));
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setBusy(false);
  }

  const auditWords = auditSearch.trim().toLowerCase();
  const shownAudit = audit.filter((event) => {
    if (auditAction !== "" && event.action !== auditAction) {
      return false;
    }
    if (auditWords === "") {
      return true;
    }
    const text = event.message + " " + (event.actor ? event.actor.name : "system") + " " + (event.request ? event.request.hostname : "");
    return text.toLowerCase().includes(auditWords);
  });

  const tabs: { key: AdminTab; label: string }[] = [
    { key: "quotas", label: "Team quotas" },
    { key: "catalog", label: "Catalog" },
    { key: "audit", label: "Audit log" },
  ];

  return (
    <div>
      <PageHeader title="Admin" subtitle="Manage team quotas and the catalog, and review what happened." />
      {error && <div className="notice notice-error">{error}</div>}

      <div className="tabs tabs-page" role="tablist">
        {tabs.map((option) => (
          <button key={option.key} role="tab" aria-selected={tab === option.key} onClick={() => setTab(option.key)}>
            {option.label}
          </button>
        ))}
      </div>

      {loading && <Skeleton rows={3} />}

      {!loading && tab === "quotas" && (
        <div className="quota-grid">
          {quotas.map((usage) => {
            const form = forms[usage.teamId];
            if (!form) {
              return null;
            }
            const changed = isChanged(usage, form);
            const valid = isValid(form);
            return (
              <section className="card" key={usage.teamId}>
                <h3>{usage.teamName}</h3>
                <QuotaBars usage={usage} />
                <div className="quota-fields">
                  <label>
                    CPU cores
                    <input
                      type="number"
                      min={0}
                      value={form.cpuQuota}
                      aria-invalid={!isValidAmount(form.cpuQuota)}
                      onChange={(e) => updateForm(usage.teamId, "cpuQuota", e.target.value)}
                    />
                  </label>
                  <label>
                    Memory (MB)
                    <input
                      type="number"
                      min={0}
                      step={1024}
                      value={form.memoryQuotaMb}
                      aria-invalid={!isValidAmount(form.memoryQuotaMb)}
                      onChange={(e) => updateForm(usage.teamId, "memoryQuotaMb", e.target.value)}
                    />
                  </label>
                  <label>
                    Disk (GB)
                    <input
                      type="number"
                      min={0}
                      value={form.diskQuotaGb}
                      aria-invalid={!isValidAmount(form.diskQuotaGb)}
                      onChange={(e) => updateForm(usage.teamId, "diskQuotaGb", e.target.value)}
                    />
                  </label>
                </div>
                {!valid && <small className="field-error">Use whole numbers, 0 or more.</small>}
                <div className="card-actions">
                  {changed && (
                    <button className="secondary" disabled={busy} onClick={() => resetForm(usage)}>
                      Undo changes
                    </button>
                  )}
                  <button disabled={busy || !changed || !valid} onClick={() => saveQuota(usage)}>
                    Save quota
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {!loading && tab === "catalog" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Platform</th>
                <th>Size</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((item) => (
                <tr key={item.id}>
                  <td className="row-title">{item.name}</td>
                  <td>
                    <span className={"tag platform-" + item.platform.toLowerCase()}>{formatPlatform(item.platform)}</span>
                  </td>
                  <td className="nowrap">
                    {item.cpu} CPU · {formatMemory(item.memoryMb)} · {item.diskGb} GB
                  </td>
                  <td>
                    <span className={"badge " + (item.active ? "badge-completed" : "badge-decommissioned")}>
                      {item.active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="cell-action">
                    <button className={item.active ? "secondary-danger" : "secondary"} disabled={busy} onClick={() => toggleItem(item)}>
                      {item.active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === "audit" && (
        <>
          <div className="toolbar">
            <select aria-label="Filter by action" className="toolbar-select" value={auditAction} onChange={(e) => setAuditAction(e.target.value)}>
              <option value="">All actions</option>
              {Object.keys(ACTION_LABELS).map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action]}
                </option>
              ))}
            </select>
            <input
              className="toolbar-input"
              type="search"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              placeholder="Search person, server, details"
              aria-label="Search audit log"
            />
          </div>
          {shownAudit.length === 0 && <EmptyState icon="search" title="No matching events" />}
          {shownAudit.length > 0 && (
            <div className="table-wrap">
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
                  {shownAudit.map((event) => (
                    <tr key={event.id}>
                      <td className="nowrap muted">{formatDateTime(event.createdAt)}</td>
                      <td className="nowrap">{event.actor ? event.actor.name : "System"}</td>
                      <td className="nowrap">{actionLabel(event.action)}</td>
                      <td className="nowrap">{event.request ? event.request.hostname : "-"}</td>
                      <td>{event.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted small">Shows the latest 200 events.</p>
        </>
      )}
    </div>
  );
}

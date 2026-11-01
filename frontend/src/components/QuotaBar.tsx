import type { ReactNode } from "react";
import type { QuotaUsage } from "../types";

function Bar({ label, used, limit, unit }: { label: string; used: number; limit: number; unit: string }) {
  let percent = 0;
  if (limit > 0) {
    percent = Math.round((used / limit) * 100);
  }
  if (percent > 100) {
    percent = 100;
  }

  let level = "ok";
  if (percent >= 90) {
    level = "danger";
  } else if (percent >= 70) {
    level = "warn";
  }

  return (
    <div className="quota-row">
      <div className="quota-label">
        <span>{label}</span>
        <span className="quota-numbers">
          <strong>{used}</strong> / {limit} {unit}
        </span>
      </div>
      <div
        className="quota-track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={"quota-fill quota-" + level} style={{ width: percent + "%" }} />
      </div>
    </div>
  );
}

export function QuotaBars({ usage }: { usage: QuotaUsage }) {
  return (
    <>
      <Bar label="CPU" used={usage.cpu.used} limit={usage.cpu.limit} unit="cores" />
      <Bar label="Memory" used={usage.memoryMb.used} limit={usage.memoryMb.limit} unit="MB" />
      <Bar label="Disk" used={usage.diskGb.used} limit={usage.diskGb.limit} unit="GB" />
    </>
  );
}

export function QuotaCard({ usage, footer }: { usage: QuotaUsage; footer?: ReactNode }) {
  return (
    <div className="card quota-card">
      <div className="card-title">
        <h3>Team {usage.teamName}</h3>
        <span className="muted small">Quota in use</span>
      </div>
      <QuotaBars usage={usage} />
      {footer}
    </div>
  );
}

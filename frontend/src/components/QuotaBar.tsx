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
        <span>
          {used} / {limit} {unit}
        </span>
      </div>
      <div className="quota-track">
        <div className={"quota-fill quota-" + level} style={{ width: percent + "%" }} />
      </div>
    </div>
  );
}

export function QuotaCard({ usage }: { usage: QuotaUsage }) {
  return (
    <div className="card">
      <h3>Team {usage.teamName}: quota</h3>
      <Bar label="CPU" used={usage.cpu.used} limit={usage.cpu.limit} unit="cores" />
      <Bar label="Memory" used={usage.memoryMb.used} limit={usage.memoryMb.limit} unit="MB" />
      <Bar label="Disk" used={usage.diskGb.used} limit={usage.diskGb.limit} unit="GB" />
    </div>
  );
}

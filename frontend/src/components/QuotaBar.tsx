import { formatMemory } from "../format";
import type { QuotaUsage } from "../types";

interface BarProps {
  label: string;
  used: number;
  limit: number;
  text: string;
}

function Bar({ label, used, limit, text }: BarProps) {
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
        <span className="muted">{text}</span>
      </div>
      <div className="quota-track" role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className={"quota-fill quota-" + level} style={{ width: percent + "%" }} />
      </div>
    </div>
  );
}

export function QuotaBars({ usage }: { usage: QuotaUsage }) {
  const memory = usage.memoryMb;
  return (
    <>
      <Bar label="CPU" used={usage.cpu.used} limit={usage.cpu.limit} text={usage.cpu.used + " of " + usage.cpu.limit + " cores"} />
      <Bar
        label="Memory"
        used={memory.used}
        limit={memory.limit}
        text={formatMemory(memory.used) + " of " + formatMemory(memory.limit)}
      />
      <Bar
        label="Disk"
        used={usage.diskGb.used}
        limit={usage.diskGb.limit}
        text={usage.diskGb.used + " of " + usage.diskGb.limit + " GB"}
      />
    </>
  );
}

export function QuotaCard({ usage }: { usage: QuotaUsage }) {
  return (
    <div className="card">
      <h3>{usage.teamName} quota</h3>
      <p className="muted small">Used by your team's running servers.</p>
      <QuotaBars usage={usage} />
    </div>
  );
}

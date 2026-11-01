// Small building blocks used on several pages.

import type { ReactNode } from "react";
import type { Environment, Platform } from "../types";

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="card empty-state">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function Loading({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="page-loading">
      <span className="spinner" /> {text}
    </div>
  );
}

export function EnvTag({ env }: { env: Environment }) {
  return <span className={"tag env-" + env.toLowerCase()}>{env}</span>;
}

export function PlatformTag({ platform }: { platform: Platform }) {
  return <span className={"tag platform-" + platform.toLowerCase()}>{platform === "AWS" ? "AWS" : "Proxmox"}</span>;
}

// Pieces shared by the pages: the page heading, empty messages and loading placeholders.

import { useEffect } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  useEffect(() => {
    document.title = title + " · Infra Portal";
  }, [title]);

  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  text?: string;
  icon?: "inbox" | "checkCircle" | "search" | "alert";
  children?: ReactNode;
}

export function EmptyState({ title, text, icon = "inbox", children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={24} />
      </span>
      <h3>{title}</h3>
      {text && <p className="muted">{text}</p>}
      {children}
    </div>
  );
}

// Grey blocks shown while a page loads, so the layout does not jump.
export function Skeleton({ rows = 3 }: { rows?: number }) {
  const items = [];
  for (let i = 0; i < rows; i++) {
    items.push(<div className="skeleton" key={i} />);
  }
  return (
    <div className="skeleton-list" role="status" aria-label="Loading">
      {items}
    </div>
  );
}

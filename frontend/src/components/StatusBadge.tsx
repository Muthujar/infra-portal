import type { RequestStatus } from "../types";

// Human friendly labels for each status.
const LABELS: Record<RequestStatus, string> = {
  PENDING_APPROVAL: "Waiting for approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PROVISIONING: "Creating server",
  CONFIGURING: "Setting up",
  COMPLETED: "Ready",
  FAILED: "Failed",
  DECOMMISSIONING: "Deleting",
  DECOMMISSIONED: "Deleted",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <span className={"badge badge-" + status.toLowerCase()}>{LABELS[status]}</span>;
}

// True while the worker is still busy, so pages know to refresh.
export function isInProgress(status: RequestStatus): boolean {
  return (
    status === "APPROVED" ||
    status === "PROVISIONING" ||
    status === "CONFIGURING" ||
    status === "DECOMMISSIONING"
  );
}

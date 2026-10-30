// Shapes of the data the API sends back.

export type Role = "REQUESTER" | "APPROVER" | "ADMIN";
export type Platform = "PROXMOX" | "AWS";
export type Environment = "DEV" | "QA" | "PROD";
export type RequestStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "PROVISIONING"
  | "CONFIGURING"
  | "COMPLETED"
  | "FAILED"
  | "DECOMMISSIONING"
  | "DECOMMISSIONED";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  teamId: number;
  teamName: string;
}

export interface CatalogItem {
  id: number;
  name: string;
  description: string;
  platform: Platform;
  osName: string;
  cpu: number;
  memoryMb: number;
  diskGb: number;
  awsInstanceType: string | null;
  active: boolean;
}

export interface AuditEvent {
  id: number;
  action: string;
  message: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus | null;
  createdAt: string;
  actor: { name: string; email?: string } | null;
  request?: { hostname: string } | null;
  requestId: number | null;
}

export interface ServerRequest {
  id: number;
  hostname: string;
  environment: Environment;
  justification: string;
  status: RequestStatus;
  platform: Platform;
  cpu: number;
  memoryMb: number;
  diskGb: number;
  approvalComment: string | null;
  terraformCode: string | null;
  provisionLog: string | null;
  externalId: string | null;
  configJobId: string | null;
  errorMessage: string | null;
  leaseDays: number | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  catalogItem: { name: string; osName: string };
  requester: { name: string; email: string };
  approver: { name: string } | null;
  team: { name: string };
  auditEvents?: AuditEvent[];
}

export interface QuotaUsage {
  teamId: number;
  teamName: string;
  cpu: { used: number; limit: number };
  memoryMb: { used: number; limit: number };
  diskGb: { used: number; limit: number };
}

# Architecture

The diagrams below are written in Mermaid, so GitHub draws them on this page. The same diagrams are also saved as image files in [`docs/diagrams/`](diagrams/):
[system overview](diagrams/system-overview.png), [request life cycle](diagrams/request-lifecycle.png), [request sequence](diagrams/request-sequence.png) and [data model](diagrams/data-model.png).

## System overview

```mermaid
flowchart LR
    U["User's browser<br/>React + TypeScript"] -->|"REST /api (JWT)"| API["API server<br/>Node.js + Express"]
    API -->|Prisma| DB[("PostgreSQL<br/>users, teams, quotas,<br/>catalog, requests, audit")]
    API -->|"add job"| Q[["Redis + BullMQ<br/>job queue"]]
    Q -->|"take job"| W["Worker<br/>Node.js"]
    W -->|"status, logs"| DB
    Q -->|"every minute:<br/>expire-leases"| W

    W --> P{"Provisioner<br/>(PROVISIONER)"}
    P -->|mock| PM["Simulated Terraform"]
    P -->|local| TF["Terraform CLI"]
    P -->|gitlab| GL["GitLab CI API<br/>commit main.tf + run pipeline"]
    GL --> TF2["Terraform in pipeline"]
    TF --> PVE["Proxmox VE<br/>(LXC containers)"]
    TF --> AWS["AWS EC2"]
    TF2 --> PVE
    TF2 --> AWS

    W --> C{"Configurator<br/>(CONFIGURATOR)"}
    C -->|mock| CM["Simulated AWX job"]
    C -->|awx| AWX["AWX API<br/>runs Ansible playbook"]
    AWX --> PVE
    AWX --> AWS
```

### Components

| Component | Responsibility |
|---|---|
| **React front end** | Catalog, request form, live request status, approvals screen, admin screen. Hides pages the user's role cannot use. |
| **API server** | Login (JWT), RBAC checks, input validation (Zod), quota checks, approval rules, Terraform generation, audit log. Never does slow work itself. |
| **PostgreSQL** | Single source of truth for requests and their history. |
| **Redis + BullMQ** | Queue between the API and the worker. The API answers in milliseconds; provisioning can take minutes. |
| **Worker** | Takes jobs from the queue, runs the provisioner and configurator, and moves the request through its statuses. Runs at most 2 jobs at once. Every minute it also decommissions servers whose lease has ended. |
| **Provisioner** | Creates or deletes the server. Same interface for all three implementations: mock, local Terraform, GitLab pipeline. |
| **Configurator** | Sets up software inside the new server. Same interface for mock and AWX. |

The **connector pattern** (one interface, a mock and a real implementation) means the demo can run on any laptop, and switching to real systems is only a configuration change.

## Request life cycle (state machine)

```mermaid
stateDiagram-v2
    [*] --> PENDING_APPROVAL: user submits
    PENDING_APPROVAL --> APPROVED: approver approves<br/>(Terraform generated, job queued)
    PENDING_APPROVAL --> REJECTED: approver rejects
    APPROVED --> PROVISIONING: worker starts
    PROVISIONING --> CONFIGURING: server created
    PROVISIONING --> FAILED
    CONFIGURING --> COMPLETED: AWX job done
    CONFIGURING --> FAILED
    FAILED --> APPROVED: retry (build failed)
    FAILED --> DECOMMISSIONING: clean up, or retry<br/>a failed delete
    COMPLETED --> DECOMMISSIONING: user deletes server<br/>or lease ends
    DECOMMISSIONING --> DECOMMISSIONED
    DECOMMISSIONING --> FAILED
    REJECTED --> [*]
    DECOMMISSIONED --> [*]
```

All status changes go through one function (`changeStatus` in `backend/src/services/requestStatus.service.ts`). It:

1. checks that the move is allowed (for example, a REJECTED request can never be provisioned),
2. updates the row **only if the status has not changed in the meantime**, which prevents two approvers or two workers from acting on the same request,
3. writes an audit event with who did it, when, and the old and new status.

## Sequence: request to ready server

```mermaid
sequenceDiagram
    actor Dev as Developer
    actor Lead as Team lead
    participant UI as React UI
    participant API
    participant DB as PostgreSQL
    participant Q as Redis queue
    participant W as Worker
    participant TF as Terraform
    participant AWX

    Dev->>UI: choose catalog item, fill form
    UI->>API: POST /api/requests
    API->>DB: check hostname + team quota
    API->>DB: save request (PENDING_APPROVAL) + audit
    Lead->>UI: open Approvals, click Approve
    UI->>API: POST /api/requests/:id/approve
    API->>API: check role, team, PROD rule, quota
    API->>API: generate main.tf from template
    API->>DB: APPROVED + terraformCode + audit
    API->>Q: add "provision" job
    Q->>W: job
    W->>DB: PROVISIONING
    W->>TF: terraform init + apply
    TF-->>W: container id
    W->>DB: CONFIGURING
    W->>AWX: launch job template
    AWX-->>W: successful
    W->>DB: COMPLETED + logs
    UI->>API: polls GET /api/requests/:id every 2s
    API-->>UI: COMPLETED
```

## Security and RBAC rules

| Rule | Where it is enforced |
|---|---|
| Every API call except login needs a valid JWT | `requireAuth` middleware |
| Admin-only endpoints (quotas, catalog changes, audit log) | `requireRole(["ADMIN"])` |
| Requesters see only their own requests; approvers see their team's | `visibleRequestsFilter` in `requests.routes.ts` |
| Nobody can approve their own request | `checkCanApprove` |
| Approvers can approve only their team's DEV/QA requests | `checkCanApprove` |
| PROD requests need an admin | `checkCanApprove` |
| Team quota is checked on request, on approval and on retry | `assertQuotaAvailable` |
| Passwords are stored as bcrypt hashes | `seed.ts`, `auth.routes.ts` |
| Proxmox / AWS secrets never go into `main.tf` or the database; they are passed to Terraform as `TF_VAR_*` environment variables | `terraform/runner.ts` |
| All input is validated (hostname format, sizes, comments) | Zod schemas in each route |

## Data model

```mermaid
erDiagram
    TEAM ||--o{ USER : has
    TEAM ||--o{ REQUEST : owns
    USER ||--o{ REQUEST : "requests"
    USER ||--o{ REQUEST : "approves"
    CATALOG_ITEM ||--o{ REQUEST : "used by"
    REQUEST ||--o{ AUDIT_EVENT : history
    USER ||--o{ AUDIT_EVENT : "actor"

    TEAM { int id string name int cpuQuota int memoryQuotaMb int diskQuotaGb }
    USER { int id string email string name Role role int teamId }
    CATALOG_ITEM { int id string name Platform platform int cpu int memoryMb int diskGb bool active }
    REQUEST { int id string hostname Environment environment RequestStatus status int cpu int memoryMb int diskGb int leaseDays datetime expiresAt text terraformCode text provisionLog }
    AUDIT_EVENT { int id string action string message RequestStatus fromStatus RequestStatus toStatus datetime createdAt }
```

The request copies the size from the catalog item, so changing the catalog later does not change existing servers or quota usage.

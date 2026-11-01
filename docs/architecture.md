# Architecture

## System overview

```mermaid
flowchart LR
    U["Browser<br/>React + TypeScript"] -->|"REST API"| API["API server<br/>Node.js + Express"]
    API --> DB[("PostgreSQL")]
    API -.->|"optional login"| LD["LDAP directory"]
    API -->|"add job"| Q[["Redis + BullMQ<br/>job queue"]]
    Q -->|"take job"| W["Worker"]
    W --> DB

    W --> P{"Provisioner"}
    P -->|mock| PM["Simulated Terraform"]
    P -->|local| TF["Terraform"]
    P -->|gitlab| GL["GitLab pipeline<br/>runs Terraform"]
    TF --> PVE["Proxmox VE"]
    TF --> AWS["AWS EC2"]
    GL --> PVE
    GL --> AWS

    W --> C{"Configurator"}
    C -->|mock| CM["Simulated AWX job"]
    C -->|awx| AWX["AWX runs Ansible"]
```

| Part | Job |
|---|---|
| React UI | Catalog, requests, approvals and admin screens |
| API server | Login, permissions, quotas, approval rules, Terraform generation |
| PostgreSQL | Stores requests and their full history |
| Redis queue | Passes slow work from the API to the worker |
| Worker | Creates, configures and deletes servers. Deletes servers when their lease ends |
| Provisioner, Configurator | Swappable mock or real connectors |

**Key idea:** provisioning takes minutes, so the API only saves the decision and queues a job. Mock and real connectors share one interface, so moving to real systems is a settings change.

## Request life cycle

```mermaid
stateDiagram-v2
    [*] --> PENDING_APPROVAL: submit
    PENDING_APPROVAL --> APPROVED: approve
    PENDING_APPROVAL --> REJECTED: reject
    APPROVED --> PROVISIONING: worker starts
    PROVISIONING --> CONFIGURING: server created
    CONFIGURING --> COMPLETED: setup done
    COMPLETED --> DECOMMISSIONING: decommission or lease ends
    DECOMMISSIONING --> DECOMMISSIONED
    PROVISIONING --> FAILED
    CONFIGURING --> FAILED
    DECOMMISSIONING --> FAILED
    FAILED --> APPROVED: retry
    FAILED --> DECOMMISSIONING: clean up
```

One function makes every status change. It blocks moves that are not allowed, stops two people acting at once, and writes the audit log.

## Security

- Every API call except login needs a valid token.
- Requesters see only their own requests. Approvers see their team's.
- Nobody can approve their own request, and PROD needs an admin.
- Team quotas are checked on request, approval and retry.
- Passwords are stored as hashes. With LDAP, the portal never stores them.
- Proxmox and AWS secrets are never saved in `main.tf` or the database.
- All input is validated on the server.

## When things fail

- **Terraform or a connector fails:** the request shows Failed with its log, and offers Retry or Decommission.
- **Redis is down:** the request is marked Failed, and Retry queues it again later.
- **The worker crashes:** the request is marked Failed. Retry continues from Terraform's saved state, so no duplicate is created.

## More diagrams

[Request sequence](diagrams/request-sequence.png) · [Data model](diagrams/data-model.png)

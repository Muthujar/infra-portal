# Submission: Infrastructure Management Tool

A working prototype of a self-service portal for requesting servers on Proxmox VE and AWS, by Muthu.

| Deliverable | Where |
|---|---|
| Source code | This repository: https://github.com/Muthujar/infra-portal |
| Architecture diagram | [docs/architecture.md](docs/architecture.md) |
| Deployment and setup | [README.md](README.md), [Proxmox setup](docs/setup-windows-proxmox.md) |
| Demo and presentation | [docs/demo.md](docs/demo.md), [slides (PDF)](docs/Infra-Portal-Presentation.pdf) |

## Run it

You need Docker Desktop. The app runs in mock mode, so no Proxmox is required.

```bash
git clone https://github.com/Muthujar/infra-portal.git
cd infra-portal
cp backend/.env.example backend/.env   # Windows: copy backend\.env.example backend\.env
docker compose up --build
```

Open http://localhost:8080 and click a demo user.

## What is included

| Part | Status |
|---|---|
| Catalog, request forms, approvals, roles, quotas, leases, audit log | Done |
| API, PostgreSQL, Redis queue, background worker | Done |
| Terraform generation for Proxmox and AWS | Done |
| Provisioning on real Proxmox VE | Done and tested |
| LDAP login (optional) | Done and tested |
| 44 automated tests and CI | Done, passing |

## Tested on real Proxmox

Running against Proxmox VE 9.2, the portal created container 100 with Terraform in about 40 seconds, then deleted it on decommission.

![Container created by the portal in Proxmox](docs/screenshots/13-proxmox-real.png)

## If this moves forward

The prototype is built so that these steps are mainly connection and configuration. The demo uses mock provisioning and configuration, so GitLab, AWX and AWS still need a full run in a company environment.

| Area | How it would be done |
|---|---|
| GitLab CI | Point the built connector at the company GitLab, with a runner inside the network |
| AWX | Point the built connector at the company AWX, and add a dynamic inventory so it can find new servers |
| AWS | Add a company AWS account and turn on `AWS_APPLY_ENABLED` |
| Company login | Connect the company directory or identity provider, and reuse the group-to-role mapping |
| Terraform state | Move it to shared storage, such as GitLab or S3 |
| Secrets | Move them to a vault |
| Notifications | Add email or Slack alerts for approvals and expiring leases |

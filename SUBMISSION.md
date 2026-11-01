# Submission: Infrastructure Management Tool

Prototype of a self-service infrastructure portal for the Kripya technical evaluation, by Muthu.
Repository: https://github.com/Muthujar/infra-portal

| Deliverable | Where |
|---|---|
| Source code | This repository: [`backend/`](backend/) (API + worker), [`frontend/`](frontend/) (React UI), [`docker-compose.yml`](docker-compose.yml), Terraform templates in [`backend/terraform-templates/`](backend/terraform-templates/), samples in [`gitlab/`](gitlab/) and [`ansible/`](ansible/) |
| Architecture diagram | [`docs/architecture.md`](docs/architecture.md) (system overview, request life cycle, sequence, data model, security rules). Image files: [`docs/diagrams/`](docs/diagrams/) |
| Setup instructions | [`README.md`](README.md) (quick start with Docker, local development, modes, tests). Windows + Proxmox in VirtualBox: [`docs/setup-windows-proxmox.md`](docs/setup-windows-proxmox.md). GitLab CI provisioning: [`docs/setup-gitlab.md`](docs/setup-gitlab.md) |
| Demo document | [`docs/demo.md`](docs/demo.md) (step-by-step walkthrough with screenshots in [`docs/screenshots/`](docs/screenshots/)) |
| Presentation | [`docs/Infra-Portal-Presentation.pdf`](docs/Infra-Portal-Presentation.pdf) (11 slides; source: [`docs/presentation/slides.html`](docs/presentation/slides.html)) |
| Tests and CI | [`backend/tests/`](backend/tests/) (44 tests) and [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |

## Run it in one command

Requirements: Docker Desktop.

```bash
git clone https://github.com/Muthujar/infra-portal.git
cd infra-portal
cp backend/.env.example backend/.env       # Windows: copy backend\.env.example backend\.env
docker compose up --build
```

Open http://localhost:8080. Demo users (password `Password@123`): `dev@demo.local` (requester), `lead@demo.local` (approver), `admin@demo.local` (admin).
The app starts in mock mode, so it runs on any machine. See the README for switching to real Proxmox, GitLab or AWX.

## Implemented features

- Service catalog with request form (Proxmox LXC and AWS EC2 server types)
- Approval workflow: approve or reject with a comment; production requests need an admin
- Role-based access control: requester, approver, admin
- Company login with LDAP (optional): roles and teams come from directory groups; demo directory included ([docs/ldap.md](docs/ldap.md))
- Team quotas for CPU, RAM and disk, checked on request, approval and retry
- Request state machine with a full audit trail
- Terraform (HCL) generation from templates, shown on each request
- Background worker with a Redis + BullMQ queue; live status in the UI
- Provisioners: mock, real local Terraform (Proxmox / AWS), GitLab CI pipeline (commit `main.tf`, run the pipeline on a self-hosted runner, copy the Terraform output back)
- Setup check script that tests the Proxmox and GitLab settings before a real run
- Configurators: mock, AWX job template (Ansible)
- Retry failed requests, decommission servers
- Server leases with automatic decommission and extension
- Admin: edit quotas, enable or disable catalog items, read the audit log
- 44 automated tests and a 4-job GitHub Actions pipeline (tests, lint, `terraform validate`, Docker smoke test)

## Verified on real Proxmox

On 2026-11-01 the portal ran with `PROVISIONER=local` against Proxmox VE 9.2 (in VirtualBox on a Windows PC).
A request for a *Small Linux Server* in DEV was approved and Terraform created LXC container 100 in about 40 seconds.
The container got an IP from the network, and it carries the tags and the note the portal sets
(`dev`, `infra-portal`, `team-payments`, "Request #3 by dev@demo.local"). Decommission deleted it again.

![Container created by the portal in Proxmox](docs/screenshots/13-proxmox-real.png)

## Scope: what is real, mocked or left out

| Part | Status |
|---|---|
| Portal, workflow, approvals, RBAC, quotas, audit, leases | Implemented and tested |
| Terraform on Proxmox (`PROVISIONER=local`) | Real, verified (above) |
| GitLab CI pipeline (`PROVISIONER=gitlab`) | Tested against gitlab.com: the portal commits the generated `main.tf` to a GitLab project through the API and starts the pipeline, and a self-hosted runner (tag `infra-portal`) is registered and online. The pipeline run itself was blocked by gitlab.com's account identity verification for new free accounts (card check), so Terraform via GitLab was not run end to end. Setup guide: `docs/setup-gitlab.md` |
| AWS EC2 | Terraform is generated and validated; apply is off by default (`AWS_APPLY_ENABLED`) to avoid cloud cost |
| AWX configuration | Real connector implemented (`CONFIGURATOR=awx`); mocked in the demo because AWX needs a Kubernetes cluster. A real rollout also needs a Proxmox dynamic inventory in AWX, since containers get their IP from DHCP |
| LDAP login | Implemented and tested against a real OpenLDAP directory in CI; off by default, switch on with `LDAP_URL` ([docs/ldap.md](docs/ldap.md)) |
| SAML single sign-on | Not implemented. Next step: Keycloak or Entra ID with the same group-to-role mapping |

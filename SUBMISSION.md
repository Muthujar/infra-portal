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
| Tests and CI | [`backend/tests/`](backend/tests/) (36 tests) and [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |

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
- 34 automated tests and a 4-job GitHub Actions pipeline (tests, lint, `terraform validate`, Docker smoke test)

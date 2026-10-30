# Handoff notes

Context for anyone (or any Claude project) continuing this work.

## Background

- This is Muthu's technical evaluation for **Kripya** (contact: Vignesh Sugumaran). Task: build a working prototype of the "Infrastructure Management Tool" and submit the repo, an architecture diagram, setup instructions and a demo document.
- Muthu is a full stack developer (React / Node). Infra tools (Terraform, Proxmox, GitLab CI, AWX/Ansible) are new to them, so explanations should be plain and code should stay explicit (simple loops and if/else, comments, no clever one-liners).
- Original plan and plain-English explanations of every tool: [plan.md](plan.md).

## Status (2026-10-30)

Done and tested end to end in a browser (mock mode):
- Backend API, worker, Prisma schema + seed, Terraform templates and generator
- Connectors: mock, local Terraform, GitLab (untested against real GitLab), AWX (untested against real AWX)
- React UI: login, catalog, request form, requests list, request detail (live), approvals, admin
- README, architecture diagrams (Mermaid), demo guide, screenshots

Verified separately: the local Terraform runner calls the real `terraform` binary, and templates pass `terraform fmt`. A full `terraform apply` against Proxmox has **not** been run yet. It needs Muthu's Proxmox VM.

Added later on 2026-10-30:
- Lease / expiry: the request form asks for 7, 30 or 90 days (or no expiry); the worker decommissions expired servers every minute; owners can extend by 30 days
- 29 automated tests (Vitest + Supertest) for the workflow, RBAC, validation, quotas and leases
- GitHub Actions CI: backend tests, frontend lint/build, `terraform validate` of the generated files, and `docker compose up --build` with an end-to-end smoke test (`scripts/smoke-test.sh`)
- Fix: "Retry" after a failed decommission now retries the delete instead of rebuilding the server
- Windows + VirtualBox + Proxmox setup guide: docs/setup-windows-proxmox.md
- Submission package: SUBMISSION.md, rendered diagrams in docs/diagrams/, refreshed screenshots, 11-slide docs/Infra-Portal-Presentation.pdf

Not yet done:
- Install Proxmox in VirtualBox on Muthu's Windows laptop (32 GB RAM) and test `PROVISIONER=local` for real (README section "Using real Proxmox")
- Optional: deploy to Muthu's Hostinger VPS (8 GB) as a live URL in mock mode
- Optional: SAML/LDAP via Keycloak
- Send the submission email to Vignesh with the repo link

## Known things to check on first real Proxmox run

- `PROXMOX_NODE` must match the node name in the Proxmox tree.
- `PROXMOX_LXC_TEMPLATE` must match the downloaded template file name exactly.
- The bpg/proxmox provider version is `>= 0.66.0`. If an argument changed in a newer version, `terraform init/apply` output in the request's provisioning log will say which.
- The API token user needs permission to create containers (simplest for the prototype: `root@pam` token with privilege separation off).

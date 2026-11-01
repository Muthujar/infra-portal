# Demo guide

This guide walks through the prototype as a short story. Each step lists what to click and what it shows. All screenshots are in `docs/screenshots/`.

## The problem

Today a developer who needs a server raises a ticket, waits for the DevOps team, and the server is created by hand. That is slow, every server ends up slightly different, and there is no clear record of who asked for what and who approved it.

**Infra Portal** turns this into a self-service flow: pick from a catalog, get approval, and automation creates and configures the server.

## 1. Log in

![Login](screenshots/01-login.png)

Three demo users show the three roles (RBAC): developer, team lead and DevOps admin. Click **Developer** under "Try a demo user".

## 2. Browse the service catalog

![Catalog](screenshots/02-catalog.png)

- Standard server sizes on **Proxmox** (company's own hardware) and **AWS** (public cloud).
- The quota box on the right shows how much CPU, RAM and disk the team is already using.

## 3. Request a server

![Request form](screenshots/03-request-form.png)

Click **Request server** on *Small Linux Server*, enter hostname `billing-api-01`, choose **DEV**, keep the **30 day lease**, and give a reason. Click **Review and submit**: a confirm box shows a summary and who will approve it.
The form checks the hostname when you leave the field. The API validates it again, checks that it is not already in use, and checks the team quota.

![Pending](screenshots/04-request-pending.png)

## 4. Quota enforcement

![Quota exceeded](screenshots/05-quota-exceeded.png)

Request two *Database Servers*. The second one is blocked before it reaches anyone, with a clear message that says exactly which limit is exceeded.

## 5. Approve as team lead

![Approvals](screenshots/06-approvals.png)

Log out and click **Team lead**, then open **Approvals** (the sidebar badge shows how many requests are waiting).

- The lead sees only their team's DEV/QA requests.
- PROD requests are **not** shown to the lead, because production needs an admin.
- Each card shows the size, the reason and the lease the requester asked for.
- Click **Approve**. A confirm box shows what will be created and takes an optional comment. Rejecting asks for a reason, which the requester sees.
- At this moment the API generates the Terraform code and puts a job on the queue.

## 6. Watch it being created

![Provisioning](screenshots/07-provisioning.png)

Open the request. The progress bar and timeline update every 2 seconds:
**Approved → Creating server (Terraform) → Setting up (AWX) → Ready**

![Completed](screenshots/08-completed.png)

- **Terraform tab:** the exact code used to create the server. It contains no secrets.
- **Timeline:** the audit trail, showing who did what and when.
- **Provisioning log tab:** the Terraform and AWX output.

With `PROVISIONER=local` and Proxmox running, the container now also appears in the Proxmox web UI.

## 7. Failure and retry

![Failed](screenshots/09-failed.png)

A request whose hostname contains `fail` simulates a Terraform error in mock mode. The request shows **Failed**, the error message and the log, with **Retry** and **Decommission** buttons. Failed requests release their quota.

## 8. Admin view

![All requests](screenshots/10-all-requests.png)

Log in as **DevOps admin**:

- **Approvals:** approve the PROD request.
- **Requests:** see every team's requests.
- **Admin:** change team quotas (the confirm box shows old and new limits), disable a catalog item, and search the full audit log.

![Admin](screenshots/11-admin.png)

## 9. Decommission

On a ready server, click **Decommission**. Because this cannot be undone, you type the hostname to confirm. The worker runs `terraform destroy`, the status becomes **Deleted** and the quota is released.

## 10. Leases

In the request form, pick a **Lease** of 7, 30 or 90 days (or no expiry). When the server is ready, the detail page shows the expiry date and an **Extend lease** button (adds 30 days after a confirm). The worker checks every minute and decommissions servers whose lease has ended, writing "Lease ended, decommissioning automatically" to the timeline.

![Lease](screenshots/12-lease.png)

## What is real and what is simulated

| Part | Status |
|---|---|
| UI, API, database, RBAC, quotas, approvals, audit log, leases, queue and worker | Real |
| Terraform code generation | Real |
| Running Terraform against Proxmox (`PROVISIONER=local`) | Real, needs Proxmox (for example in VirtualBox) |
| AWS | Terraform generated and validated; apply disabled by default to avoid cost |
| GitLab pipeline (`PROVISIONER=gitlab`) | Real API code and sample `.gitlab-ci.yml`. Tested against gitlab.com: commits `main.tf` and starts the pipeline; the job itself was blocked by gitlab.com account verification (see SUBMISSION.md) |
| AWX (`CONFIGURATOR=awx`) | Real API code and sample playbook; mock used in the demo |
| LDAP login | Real: optional OpenLDAP container (`--profile ldap`), directory groups mapped to roles and teams. See [ldap.md](ldap.md) |
| SAML single sign-on | Not built. Next step: Keycloak or Azure AD in front of the same role mapping |

## Quality: tests and CI

- **44 automated tests** (Vitest + Supertest) cover the full request life cycle, the approval rules, input validation, quotas, leases, the GitLab connector against a fake GitLab API, and LDAP login against a real OpenLDAP server (in CI). They run against a real PostgreSQL database.
- **GitHub Actions** runs on every push: backend typecheck, tests and build; frontend lint and build; `terraform fmt` and `terraform validate` on the generated Proxmox and AWS files; and `docker compose up --build` followed by `scripts/smoke-test.sh`, which takes one request all the way to Ready.

## Key design decisions

1. **Queue + worker.** Provisioning takes minutes, so the API only records the decision and queues a job. The UI polls for status. If the worker restarts, jobs are still in Redis.
2. **One state machine.** Every status change goes through one function that checks allowed transitions, guards against two people acting at once, and writes the audit log.
3. **Connector interfaces.** Mock and real implementations share the same interface, so the demo runs anywhere and production only needs configuration.
4. **Generated, reviewable Terraform.** The approver's decision and the exact code are saved together, so you can always see what was built.
5. **Secrets stay out of code.** Credentials are passed to Terraform as environment variables, never written to `main.tf` or the database.
6. **Leases.** Every server can have an end date, so test servers do not live forever. The worker cleans them up automatically, and owners can extend a lease.

# Kripya technical evaluation: project choice and build plan

## 1. Recommendation: Infrastructure Management Tool

Pick the **Infrastructure Management Tool** (a self-service portal for requesting virtual machines).

Why this one fits you best:

- **It is a full stack web app at heart.** A React + TypeScript front end, a Node.js REST API, and a PostgreSQL database. That is exactly your daily work, so you can explain every line confidently.
- **The infra parts can be honestly simulated.** The core of the app is forms, approvals, roles, quotas and status tracking. The "real infrastructure" calls (Terraform, GitLab, AWX) sit at the very end of the flow, so you can put them behind a clean interface and plug in a mock for the demo.
- **It is easy to demo.** An interviewer can watch a user submit a request, a manager approve it, and the status change step by step on screen.

### Quick comparison

| Project | What the work really is | Fit for you | Main risk |
|---|---|---|---|
| VM Inventory Management | Backend data pipeline: pull VM data from 5 platforms, normalize, sync into NetBox | Medium | Needs cloud accounts and a NetBox install; little UI to show; mostly Python/Go style data work |
| SSL Certificate Rotation | DevOps automation: ACME challenges, DNS APIs, Ansible playbooks | Low | Needs real domains/DNS, Ansible knowledge; hard to explain without ops experience |
| **Infrastructure Management Tool** | **Web portal with workflow, RBAC, approvals, plus generated Terraform** | **High** | Must be clear about what is mocked (easy to handle, see section 4) |

---

## 2. The unfamiliar tech, in plain words

Think of the company as having a "private cloud". Employees want servers (VMs), and today they raise a ticket and wait days. Your portal turns that into a shopping-style self-service flow.

**Virtual machine (VM)**
A computer that is simulated in software. One big physical server can run many VMs, each with its own CPU, RAM, disk and operating system.

**Proxmox VE**
Free, open-source software that you install on a physical server so it can run many VMs. Think of it as a "self-hosted mini AWS EC2". It has a web UI and a REST API.

**Public cloud (AWS / Azure / GCP)**
The same idea, but the servers belong to Amazon, Microsoft or Google and you rent them.

**VMware vRealize Automation / Aria**
An expensive commercial product that does what you are building: a catalog where an employee picks "Small Linux VM", fills a form, a manager approves, and the VM gets created automatically. Kripya wants a prototype of this idea.

**Terraform**
A tool where you write a text file that *describes* the infrastructure you want, for example "one VM named web-01 with 2 CPUs and 4 GB RAM". You run `terraform apply` and Terraform calls the Proxmox or AWS API to make it real. If you change the file and apply again, it updates only what changed.

**HCL (HashiCorp Configuration Language)**
The language of those Terraform files. It looks like this:

```hcl
resource "proxmox_vm_qemu" "web_01" {
  name   = "web-01"
  cores  = 2
  memory = 4096
}
```

For you this is the key insight: **your Node backend only needs to generate this text from the form values.** That is string templating, which you already know.

**GitLab CI pipeline**
GitLab can run scripts automatically ("pipelines"). In a real setup, your API would commit the generated `.tf` file and call the GitLab API to say "start the pipeline", and the pipeline runs `terraform apply`. For you it is just one REST call: `POST /projects/:id/pipeline`.

**Ansible**
A tool that logs into servers and configures them using YAML files called "playbooks", for example "install nginx, create user muthu, open port 443". Terraform *creates* the VM; Ansible *sets it up* afterwards.

**AWX**
The open-source web UI and REST API for running Ansible playbooks. Your API would call `POST /api/v2/job_templates/:id/launch/` and then poll the job status. Again, just a REST call.

**RBAC (role-based access control)**
Who is allowed to do what. Example roles: `requester` (can request VMs), `approver` (can approve or reject), `admin` (can edit catalog and quotas). You have likely done this with JWT + middleware.

**SAML / LDAP**
Corporate login systems. LDAP is the company's user directory (like Active Directory). SAML is a single sign-on protocol ("Login with company account"). In the prototype, use local JWT login with seeded users, and design the auth layer so SAML/LDAP can be plugged in later (for example with `passport-saml` or `ldapjs`).

**Quotas**
Limits per team, for example "Team Payments can use at most 16 CPUs and 64 GB RAM in total". The API checks this before accepting a request.

**Message queue (Redis + BullMQ, or RabbitMQ)**
Provisioning takes minutes, so the API should not wait inside the HTTP request. Instead it puts a job on a queue, returns immediately, and a separate worker process picks up the job and does the slow work. The front end polls (or uses WebSocket) to see status updates.

---

## 3. What the prototype will do (the key workflow)

1. **Login** as a seeded user (requester, approver or admin).
2. **Browse the service catalog**: cards like "Small Linux VM (2 CPU / 4 GB)", "Medium Windows VM", "AWS EC2 t3.medium".
3. **Fill the request form**: name, environment (dev/prod), platform (Proxmox / AWS), size, team.
4. **API validates** the input, checks RBAC and the team's **quota**, saves the request with status `PENDING_APPROVAL`.
5. **Approver** sees the request in an Approvals screen and approves or rejects it (with a comment).
6. On approval the API **generates Terraform HCL** from a template and stores it (shown in the UI).
7. A **job is queued**. The worker calls the GitLab pipeline connector, then the AWX connector.
8. **Status moves** through `APPROVED -> PROVISIONING -> CONFIGURING -> COMPLETED` (or `FAILED`), and every change is written to an **audit log**.
9. **My Requests / Dashboard** shows status, the generated Terraform, and quota usage.

### Request state machine

```
DRAFT -> PENDING_APPROVAL -> APPROVED -> PROVISIONING -> CONFIGURING -> COMPLETED
                  |                           |               |
                  v                           v               v
              REJECTED                      FAILED          FAILED
```

---

## 4. Real vs mocked (final setup)

| Part | In the prototype |
|---|---|
| React + TS UI, Node API, PostgreSQL, RBAC, quotas, approvals, audit log | Real |
| Message queue + worker | Real (Redis + BullMQ) |
| Terraform | Real: API generates HCL from templates and runs `terraform init/plan/apply` via `child_process` |
| Proxmox | Real: Proxmox VE running in VirtualBox on the laptop; Terraform creates LXC containers in it |
| AWS (public cloud) | Terraform template generated and checked with `terraform validate`; not applied (avoids cloud cost) |
| GitLab CI pipeline | Connector interface + mock (simulated delay, success/failure). Real gitlab.com connector if time allows |
| AWX job | Connector interface + mock. Real code written against the AWX REST API, switched on by env variable |
| Login (SAML/LDAP) | Start with JWT + seeded users; stretch goal: Keycloak in Docker for real SAML/LDAP |

Interviewers respect a clear "this is real, this is simulated, and here is how to switch it" story much more than a half-working real integration.

---

## 5. Environment setup (Windows laptop, 32 GB RAM + Hostinger VPS 8 GB)

### Laptop: development + real Proxmox
1. Turn on virtualization (Intel VT-x / AMD-V) in BIOS if it is not already on.
2. Install **VirtualBox 7**, **Docker Desktop**, **Node 20**, **Terraform**, **Git**.
   - Note: Docker Desktop uses Hyper-V/WSL2 on Windows. VirtualBox 7 still runs alongside it, just a bit slower. That is fine for LXC containers.
3. Download the **Proxmox VE ISO** (free) and create a VirtualBox VM: 8 GB RAM, 2-4 CPUs, 64 GB disk, network adapter in **Bridged** mode (so the laptop can reach it).
4. Install Proxmox, open its web UI at `https://<proxmox-ip>:8006`.
5. Download an LXC template in Proxmox (for example Ubuntu 22.04).
6. Create an **API token** in Proxmox for Terraform (Datacenter > Permissions > API Tokens). Put it in the API's `.env`, never in Git.
7. Test once by hand: a small Terraform file that creates one LXC container. When this works, the portal only has to generate the same file.

### Hostinger VPS: optional public demo
- Run `web`, `api`, `worker`, `postgres`, `redis` with Docker Compose and share a live URL with Kripya.
- Do **not** install Proxmox on the VPS (it would wipe the VPS, and it is already a virtual machine).
- The online version cannot reach the laptop's Proxmox, so it runs with the Docker or mock provisioner. The full Proxmox flow is shown live or in a screen recording from the laptop.

---

## 5b. Suggested tech stack

- **Front end:** React + TypeScript + Vite, React Router, React Query (or simple fetch hooks), MUI or Ant Design.
- **Backend:** Node.js + Express + TypeScript, Prisma ORM, Zod for validation, JWT auth.
- **Database:** PostgreSQL.
- **Queue:** Redis + BullMQ, with a separate `worker` process.
- **Infra-as-code:** Terraform with the Proxmox provider (LXC) and an AWS template.
- **Run everything:** Docker Compose.

---

## 6. Build plan mapped to the deliverables

### Deliverable 1: Source code repository
Suggested structure:

```
infra-portal/
  apps/
    web/          React + TS front end
    api/          Express API (routes, services, Prisma)
    worker/       BullMQ worker (provisioning steps)
  packages/
    connectors/   gitlab.ts, awx.ts, mock-gitlab.ts, mock-awx.ts
    terraform/    HCL templates + generator
  docs/           architecture diagram, setup guide, demo doc
  docker-compose.yml
  README.md
```

Phases:

0. **Day 0 (half day): Environment.** Proxmox in VirtualBox, API token, one hand-written Terraform file that creates an LXC container (section 5).
1. **Day 1: Foundation.** Repo, Docker Compose, Prisma schema (users, roles, teams, quotas, catalog_items, requests, request_events/audit), seed data, JWT login.
2. **Day 2: Catalog and requests.** Catalog API + UI, request form, validation, quota check, My Requests page.
3. **Day 3: Approvals and RBAC.** Approvals screen, approve/reject endpoints, role middleware, audit log.
4. **Day 4: Provisioning pipeline.** Terraform generator, BullMQ queue + worker that runs real Terraform against Proxmox, mock GitLab and AWX connectors, status transitions, status polling in UI.
5. **Day 5: Polish and docs.** Dashboard with quota usage, error states, a few API tests, then the documents below.

### Deliverable 2: Architecture diagram
One diagram showing: Browser (React) -> Node API -> PostgreSQL; API -> Redis queue -> Worker; Worker -> Terraform generator -> GitLab CI connector -> AWX connector -> Proxmox / AWS. Plus a second small diagram for the request state machine.

### Deliverable 3: Setup instructions (README)
Prerequisites (Docker, Node 20), `cp .env.example .env`, `docker compose up`, run migrations and seed, URLs, the seeded test users, and how to switch from mock to real GitLab/AWX connectors with env variables.

### Deliverable 4: Demo document / presentation
About 8 to 10 slides: problem, solution overview, architecture, request lifecycle, screenshots of each step, what is real vs mocked, security (RBAC, validation, audit), and "next steps for production" (real SAML, Terraform state backend, secrets vault, retries).

---

## 7. How to explain it in the interview (one-paragraph pitch)

"I built a self-service infrastructure portal, similar to vRealize Automation. A user picks a VM from a service catalog and submits a request. The Node API validates it, checks the team's quota and the user's role, and stores it in PostgreSQL. After a manager approves it, the API generates Terraform configuration from a template and pushes a job to a Redis queue. A separate worker triggers the GitLab pipeline to run Terraform and then an AWX job to configure the VM, updating the request status and audit log at each step. For the prototype, the GitLab and AWX connectors are mocked behind the same interface as the real ones, so switching to real systems is a configuration change."

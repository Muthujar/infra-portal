# Demo guide

**The problem:** getting a server means a ticket, a wait, and a manual build, with no clear record of who approved what.

**The solution:** pick from a catalog, get approval, and automation builds the server.

This walkthrough takes about 5 minutes. Start the app with the [quick start](../README.md#quick-start).

## 1. Request a server

Click **Developer**, then **Request server** on *Small Linux Server*. Enter hostname `billing-api-01` and a reason, then click **Review and submit**.

The team's quota is shown beside the catalog.

![Catalog](screenshots/02-catalog.png)

![Request form](screenshots/03-request-form.png)

## 2. Quota limits

Request two *Database Servers*. The second is refused with a message saying which limit was reached.

![Quota exceeded](screenshots/05-quota-exceeded.png)

## 3. Approve

Log out and click **Team lead**. Open **Approvals**, then click **Approve**.

Team leads approve DEV and QA for their own team. PROD needs an admin.

![Approvals](screenshots/06-approvals.png)

## 4. Watch it build

Open the request. The page updates by itself: **Approved → Creating server → Setting up → Ready**.

The tabs show the generated Terraform and the provisioning log. The timeline shows who did what.

![Completed request](screenshots/08-completed.png)

## 5. See a failure

Request a server with `fail` in its hostname, such as `billing-fail-01`, and approve it. The page shows the error and the log, with **Retry** and **Decommission** buttons.

![Failed request](screenshots/09-failed.png)

## 6. Admin

Log in as **DevOps admin**. Approve PROD requests, edit team quotas, disable catalog items and search the audit log.

![Admin](screenshots/11-admin.png)

## 7. Decommission and leases

On a ready server, click **Decommission** and type the hostname to confirm. The server is deleted and the quota is released.

Servers with a lease are deleted automatically when it ends. **Extend lease** adds 30 days.

![Lease](screenshots/12-lease.png)

## Real or simulated?

The demo runs in mock mode. See [what is included](../SUBMISSION.md#what-is-included) for what is real, and the [test on real Proxmox](../SUBMISSION.md#tested-on-real-proxmox).

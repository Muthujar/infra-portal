# Set up GitLab CI provisioning

In this mode, the worker commits `main.tf` to a GitLab project and a pipeline runs Terraform. The job runs on a runner on your own machine, because gitlab.com cannot reach a private Proxmox server.

**Before you start:** finish the [Proxmox setup](setup-windows-proxmox.md). This takes about 30 minutes.

## 1. Create the project

1. On https://gitlab.com, complete **identity verification** for your account. Pipelines cannot run without it, even on your own runner.
2. Create a private blank project named `infra-portal-infra`, with a README.
3. Add a file named `.gitlab-ci.yml` with the contents of [`gitlab/.gitlab-ci.yml`](../gitlab/.gitlab-ci.yml).

## 2. Add variables

In *Settings > CI/CD > Variables*, add these with **Protect variable** unticked:

| Key | Value |
|---|---|
| `TF_VAR_proxmox_endpoint` | `https://<proxmox-ip>:8006/` |
| `TF_VAR_proxmox_api_token` | `root@pam!portal=<secret>` |
| `TF_VAR_container_password` | Root password for new containers |

On the same page, set **Minimum role to use pipeline variables** to **Maintainer**.

## 3. Start a runner

Go to *Settings > CI/CD > Runners > New project runner*, add the tag `infra-portal`, and copy the `glrt-` token. Then run this from the repo root:

```powershell
docker compose -f gitlab/runner/docker-compose.yml run --rm runner register --non-interactive --url https://gitlab.com --token glrt-XXXX --executor docker --docker-image alpine:3.20
docker compose -f gitlab/runner/docker-compose.yml up -d
```

The runner should show **Online** in GitLab.

## 4. Connect the portal

Create a personal access token with the **api** scope (*Avatar > Edit profile > Access tokens*). This is different from the `glrt-` runner token.

Edit `backend\.env`, keeping your `PROXMOX_*` values:

```
PROVISIONER=gitlab
GITLAB_TOKEN=glpat-XXXX
GITLAB_PROJECT_ID=your-group/infra-portal-infra
```

Restart the portal and check the settings:

```powershell
docker compose up -d --force-recreate api worker
docker compose run --rm api npx tsx scripts/check-setup.ts
```

Request a server and approve it. The provisioning log links to the commit and the pipeline.

## Troubleshooting

| Error | Fix |
|---|---|
| HTTP 401 on commit | Use a `glpat-` token with the `api` scope |
| HTTP 404 on commit | `GITLAB_PROJECT_ID` must match the project URL |
| "Insufficient permissions to set pipeline variables" | Set the minimum role from step 2 |
| "Identity verification is required" | Verify your gitlab.com account |
| Pipeline stays pending | No online runner has the `infra-portal` tag |
| Job cannot reach Proxmox | Check `TF_VAR_proxmox_endpoint` |

// Checks the settings in .env against the real Proxmox and GitLab before you approve a real request.
// Each check prints OK or what to fix. Nothing is created or changed.
//
// Run with Docker (from the repo root):  docker compose run --rm api npx tsx scripts/check-setup.ts
// Or without Docker (from backend/):     npx tsx scripts/check-setup.ts

import { config } from "../src/config";

// Proxmox uses a self-signed certificate (the Terraform template also sets insecure = true).
// This script only reads, so accepting it here is fine for a lab setup.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

let problems = 0;

function ok(message: string) {
  console.log("  OK    " + message);
}

function fail(message: string, fix: string) {
  problems = problems + 1;
  console.log("  FIX   " + message);
  console.log("        -> " + fix);
}

async function getJson(url: string, headers: Record<string, string>): Promise<{ status: number; data: any }> {
  const response = await fetch(url, { headers: headers });
  const text = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data: data };
}

async function checkProxmox() {
  console.log("\nProxmox (" + config.proxmox.endpoint + ")");
  if (!config.proxmox.endpoint || !config.proxmox.apiToken) {
    fail("PROXMOX_ENDPOINT or PROXMOX_API_TOKEN is empty", "fill them in backend/.env (see docs/setup-windows-proxmox.md)");
    return;
  }

  const base = config.proxmox.endpoint.replace(/\/$/, "") + "/api2/json";
  const headers = { Authorization: "PVEAPIToken=" + config.proxmox.apiToken };

  let nodes;
  try {
    nodes = await getJson(base + "/nodes", headers);
  } catch (error) {
    fail("cannot reach Proxmox: " + String(error), "check the IP, that the VM is running, and the VirtualBox network adapter");
    return;
  }
  if (nodes.status === 401) {
    fail("Proxmox rejected the API token (401)", "format is root@pam!portal=<secret>, and Privilege Separation must be off");
    return;
  }
  ok("API reachable and token accepted");

  const nodeNames: string[] = [];
  for (const node of nodes.data.data || []) {
    nodeNames.push(node.node);
  }
  if (!nodeNames.includes(config.proxmox.node)) {
    fail("node '" + config.proxmox.node + "' not found", "set PROXMOX_NODE to one of: " + nodeNames.join(", "));
    return;
  }
  ok("node '" + config.proxmox.node + "' exists");

  const nodeBase = base + "/nodes/" + config.proxmox.node;
  const storage = await getJson(nodeBase + "/storage", headers);
  const storageNames: string[] = [];
  for (const item of storage.data.data || []) {
    storageNames.push(item.storage);
  }
  if (storageNames.includes(config.proxmox.datastore)) {
    ok("storage '" + config.proxmox.datastore + "' exists");
  } else {
    fail("storage '" + config.proxmox.datastore + "' not found", "set PROXMOX_DATASTORE to one of: " + storageNames.join(", "));
  }

  // The template id looks like "local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst"
  const templateStorage = config.proxmox.lxcTemplate.split(":")[0];
  const templates = await getJson(nodeBase + "/storage/" + templateStorage + "/content?content=vztmpl", headers);
  const templateIds: string[] = [];
  for (const item of templates.data.data || []) {
    templateIds.push(item.volid);
  }
  if (templateIds.includes(config.proxmox.lxcTemplate)) {
    ok("container template found");
  } else if (templateIds.length === 0) {
    fail("no container templates downloaded on '" + templateStorage + "'", "download ubuntu-22.04-standard in Proxmox: local > CT Templates > Templates");
  } else {
    fail("template '" + config.proxmox.lxcTemplate + "' not found", "set PROXMOX_LXC_TEMPLATE to one of: " + templateIds.join(", "));
  }
}

async function checkGitLab() {
  console.log("\nGitLab (" + config.gitlab.url + ", project " + config.gitlab.projectId + ")");
  if (!config.gitlab.token || !config.gitlab.projectId) {
    fail("GITLAB_TOKEN or GITLAB_PROJECT_ID is empty", "fill them in backend/.env (see docs/setup-gitlab.md)");
    return;
  }

  const base = config.gitlab.url + "/api/v4/projects/" + encodeURIComponent(config.gitlab.projectId);
  const headers = { "PRIVATE-TOKEN": config.gitlab.token };

  let project;
  try {
    project = await getJson(base, headers);
  } catch (error) {
    fail("cannot reach GitLab: " + String(error), "check GITLAB_URL and your internet connection");
    return;
  }
  if (project.status === 401) {
    fail("GitLab rejected the token (401)", "create a token with the 'api' scope and put it in GITLAB_TOKEN");
    return;
  }
  if (project.status === 404) {
    fail("project not found (404)", "GITLAB_PROJECT_ID is the path like 'your-name/infra-portal-infra', and the token must have access");
    return;
  }
  ok("project '" + project.data.path_with_namespace + "' found");

  const ciFile = await getJson(
    base + "/repository/files/.gitlab-ci.yml?ref=" + encodeURIComponent(config.gitlab.branch),
    headers
  );
  if (ciFile.status === 200) {
    ok(".gitlab-ci.yml is on branch '" + config.gitlab.branch + "'");
  } else {
    fail(".gitlab-ci.yml not found on branch '" + config.gitlab.branch + "'", "copy gitlab/.gitlab-ci.yml from this repo to the root of the GitLab project");
  }

  const variables = await getJson(base + "/variables", headers);
  if (variables.status === 200) {
    const keys: string[] = [];
    for (const item of variables.data) {
      keys.push(item.key);
    }
    const needed = ["TF_VAR_proxmox_endpoint", "TF_VAR_proxmox_api_token", "TF_VAR_container_password"];
    const missing = needed.filter((key) => !keys.includes(key));
    if (missing.length === 0) {
      ok("CI/CD variables are set");
    } else {
      fail("missing CI/CD variables: " + missing.join(", "), "add them in GitLab: Settings > CI/CD > Variables");
    }
  } else {
    fail("cannot read CI/CD variables (HTTP " + variables.status + ")", "the token needs the Maintainer or Owner role on the project");
  }

  const runners = await getJson(base + "/runners", headers);
  if (runners.status !== 200) {
    fail("cannot list runners (HTTP " + runners.status + ")", "the token needs the Maintainer or Owner role on the project");
    return;
  }
  let onlineWithTag = false;
  for (const runner of runners.data) {
    if (runner.status !== "online") {
      continue;
    }
    const detail = await getJson(config.gitlab.url + "/api/v4/runners/" + runner.id, headers);
    if (detail.data && Array.isArray(detail.data.tag_list) && detail.data.tag_list.includes("infra-portal")) {
      onlineWithTag = true;
    }
  }
  if (onlineWithTag) {
    ok("a runner with tag 'infra-portal' is online");
  } else {
    fail("no online runner with tag 'infra-portal'", "start it with gitlab/runner/docker-compose.yml and give it the tag 'infra-portal'");
  }
}

async function main() {
  console.log("Infra Portal setup check. PROVISIONER=" + config.provisioner);

  if (config.provisioner === "mock") {
    console.log("\nMock mode: nothing outside the portal is used, so there is nothing to check.");
    return;
  }

  await checkProxmox();
  if (config.provisioner === "gitlab") {
    await checkGitLab();
  }

  console.log("");
  if (problems === 0) {
    console.log("All checks passed. Approve a request in the portal to create a real server.");
  } else {
    console.log(problems + " thing(s) to fix before a real run.");
    process.exitCode = 1;
  }
}

main();

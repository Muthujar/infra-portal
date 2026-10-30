// Checks the GitLab connector against a small fake GitLab API, so the calls and the log handling are tested
// without a real GitLab account.

import http from "http";
import { AddressInfo } from "net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Request } from "@prisma/client";
import { config } from "../src/config";
import { GitLabProvisioner } from "../src/connectors/gitlabProvisioner";

// ---------- The fake GitLab ----------

interface FakeState {
  commits: { file_path: string; action: string; content: string }[];
  pipelines: { variables: { key: string; value: string }[] }[];
  statusSequence: string[]; // what GET /pipelines/:id returns, one after another
  jobLog: string;
}

const fake: FakeState = { commits: [], pipelines: [], statusSequence: [], jobLog: "" };
let server: http.Server;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  const base = "/api/v4/projects/:project";

  app.get(base + "/repository/files/:file", (_req, res) => {
    res.status(404).json({ message: "404 File Not Found" });
  });
  app.post(base + "/repository/commits", (req, res) => {
    for (const action of req.body.actions) {
      fake.commits.push(action);
    }
    res.status(201).json({ short_id: "abc1234", web_url: "https://gitlab.example/commit/abc1234" });
  });
  app.post(base + "/pipeline", (req, res) => {
    fake.pipelines.push({ variables: req.body.variables });
    res.status(201).json({ id: 77, status: "created", web_url: "https://gitlab.example/pipelines/77" });
  });
  app.get(base + "/pipelines/:id", (_req, res) => {
    const status = fake.statusSequence.length > 1 ? fake.statusSequence.shift() : fake.statusSequence[0];
    res.json({ id: 77, status: status });
  });
  app.get(base + "/pipelines/:id/jobs", (_req, res) => {
    res.json([{ id: 501, name: "terraform", status: "success", web_url: "https://gitlab.example/jobs/501" }]);
  });
  app.get(base + "/jobs/:id/trace", (_req, res) => {
    res.type("text/plain").send(fake.jobLog);
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;

  config.gitlab.url = "http://127.0.0.1:" + port;
  config.gitlab.projectId = "muthu/infra-portal-infra";
  config.gitlab.token = "test-token";
  config.gitlab.pollIntervalMs = 5;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  fake.commits = [];
  fake.pipelines = [];
  fake.statusSequence = ["pending", "running", "success"];
  fake.jobLog =
    "\u001b[0Ksection_start:1730000000:step_script\r\u001b[0K$ terraform apply -auto-approve\n" +
    "Apply complete! Resources: 1 added, 0 changed, 0 destroyed.\n\nOutputs:\n\ncontainer_id = 101\n";
});

function sampleRequest(platform: "PROXMOX" | "AWS"): Request {
  return {
    id: 5,
    hostname: "web-01",
    platform: platform,
    terraformCode: 'resource "x" "y" {}',
    externalId: null,
  } as Request;
}

// ---------- Tests ----------

describe("GitLab provisioner", () => {
  it("commits main.tf, runs an apply pipeline and copies the Terraform output back", async () => {
    const result = await new GitLabProvisioner().provision(sampleRequest("PROXMOX"));

    expect(fake.commits).toEqual([
      { action: "create", file_path: "requests/request-5/main.tf", content: 'resource "x" "y" {}' },
    ]);
    expect(fake.pipelines[0].variables).toEqual([
      { key: "REQUEST_ID", value: "5" },
      { key: "TF_ACTION", value: "apply" },
    ]);

    // The container id comes from Terraform's output in the job log.
    expect(result.externalId).toBe("101");
    expect(result.log).toContain("https://gitlab.example/pipelines/77");
    expect(result.log).toContain("Pipeline status: running");
    expect(result.log).toContain("Apply complete!");
    // GitLab's color codes and folding markers are removed.
    expect(result.log).not.toContain("\u001b");
    expect(result.log).not.toContain("section_start");
  });

  it("fails the step and keeps the job log when the pipeline fails", async () => {
    fake.statusSequence = ["running", "failed"];
    fake.jobLog = "Error: storage 'local-lvm' does not exist\n";

    await expect(new GitLabProvisioner().provision(sampleRequest("PROXMOX"))).rejects.toMatchObject({
      message: "GitLab pipeline failed",
      log: expect.stringContaining("storage 'local-lvm' does not exist"),
    });
  });

  it("only validates AWS requests while AWS_APPLY_ENABLED is false", async () => {
    const result = await new GitLabProvisioner().provision(sampleRequest("AWS"));
    expect(fake.pipelines[0].variables).toContainEqual({ key: "TF_ACTION", value: "validate" });
    expect(result.externalId).toBe("aws-validated-only");
  });

  it("runs a destroy pipeline on decommission", async () => {
    fake.jobLog = "Destroy complete! Resources: 1 destroyed.\n";
    const request = { ...sampleRequest("PROXMOX"), externalId: "101" } as Request;
    const result = await new GitLabProvisioner().destroy(request);
    expect(fake.pipelines[0].variables).toContainEqual({ key: "TF_ACTION", value: "destroy" });
    expect(result.log).toContain("Destroy complete!");
  });

  it("gives a clear error when GitLab cannot be reached", async () => {
    const savedUrl = config.gitlab.url;
    config.gitlab.url = "http://127.0.0.1:1";
    await expect(new GitLabProvisioner().provision(sampleRequest("PROXMOX"))).rejects.toThrow("Could not reach GitLab");
    config.gitlab.url = savedUrl;
  });
});

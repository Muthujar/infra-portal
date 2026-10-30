// Runs Terraform through a GitLab CI pipeline instead of on this machine.
// Flow: commit main.tf to the GitLab repo -> start a pipeline -> wait until it finishes -> copy the job log back.
// The pipeline itself is defined in gitlab/.gitlab-ci.yml (copy it to the root of your GitLab project).
// Setup guide: docs/setup-gitlab.md
// GitLab API docs: https://docs.gitlab.com/ee/api/commits.html, https://docs.gitlab.com/ee/api/pipelines.html,
// https://docs.gitlab.com/ee/api/jobs.html

import { Request } from "@prisma/client";
import { config } from "../config";
import { Provisioner, StepResult, StepError, sleep } from "./types";

const GIVE_UP_AFTER_MS = 30 * 60 * 1000; // 30 minutes

// The pipeline is finished when it has one of these statuses.
const FINISHED_STATUSES = ["success", "failed", "canceled", "skipped"];

// What the pipeline should do: create the server, delete it, or only check the code.
type TerraformAction = "apply" | "destroy" | "validate";

interface GitLabResponse {
  ok: boolean;
  status: number;
  data: any;
}

export class GitLabProvisioner implements Provisioner {
  name = "gitlab";

  private apiUrl(pathPart: string): string {
    const projectId = encodeURIComponent(config.gitlab.projectId);
    return config.gitlab.url + "/api/v4/projects/" + projectId + pathPart;
  }

  private async callGitLab(method: string, pathPart: string, body?: unknown): Promise<GitLabResponse> {
    let response: Response;
    try {
      response = await fetch(this.apiUrl(pathPart), {
        method: method,
        headers: {
          "PRIVATE-TOKEN": config.gitlab.token,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new StepError("Could not reach GitLab at " + config.gitlab.url, String(error) + "\n");
    }

    const text = await response.text();
    let data: any = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON (for example the job log, or an HTML error page). Keep the plain text.
    }
    return { ok: response.ok, status: response.status, data: data };
  }

  private async fileExists(filePath: string): Promise<boolean> {
    const encodedPath = encodeURIComponent(filePath);
    const result = await this.callGitLab(
      "GET",
      "/repository/files/" + encodedPath + "?ref=" + encodeURIComponent(config.gitlab.branch)
    );
    return result.ok;
  }

  // GitLab job logs contain color codes and folding markers for its web page; remove them for plain text.
  private cleanTrace(trace: string): string {
    let text = trace.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
    text = text.replace(/section_(start|end):\d+:[\w.-]+(\[[^\]]*\])?\r?/g, "");
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return text;
  }

  // Copies the Terraform output of the pipeline's job(s) into our log, so it shows on the request page.
  private async readJobLogs(pipelineId: string): Promise<string> {
    const jobs = await this.callGitLab("GET", "/pipelines/" + pipelineId + "/jobs");
    if (!jobs.ok || !Array.isArray(jobs.data)) {
      return "(could not read the job log)\n";
    }

    let text = "";
    for (const job of jobs.data) {
      const trace = await this.callGitLab("GET", "/jobs/" + job.id + "/trace");
      text = text + "----- job " + job.name + " (" + job.status + "): " + job.web_url + " -----\n";
      if (trace.ok && typeof trace.data === "string") {
        text = text + this.cleanTrace(trace.data) + "\n";
      }
    }
    return text;
  }

  // Starts a pipeline and waits until it is finished.
  private async runPipeline(request: Request, action: TerraformAction, log: string): Promise<StepResult> {
    const start = await this.callGitLab("POST", "/pipeline", {
      ref: config.gitlab.branch,
      variables: [
        { key: "REQUEST_ID", value: String(request.id) },
        { key: "TF_ACTION", value: action },
      ],
    });
    if (!start.ok) {
      throw new StepError(
        "Could not start GitLab pipeline (HTTP " + start.status + ")",
        log + JSON.stringify(start.data) + "\n"
      );
    }

    const pipelineId = String(start.data.id);
    log = log + "Started pipeline " + pipelineId + " (TF_ACTION=" + action + "): " + start.data.web_url + "\n";

    // Poll until the pipeline is finished. Only write a line when the status changes.
    let status = String(start.data.status);
    log = log + "Pipeline status: " + status + "\n";
    const startedAt = Date.now();
    while (!FINISHED_STATUSES.includes(status)) {
      if (Date.now() - startedAt > GIVE_UP_AFTER_MS) {
        throw new StepError("GitLab pipeline did not finish in 30 minutes", log);
      }
      await sleep(config.gitlab.pollIntervalMs);

      const check = await this.callGitLab("GET", "/pipelines/" + pipelineId);
      const newStatus = check.data && check.data.status ? String(check.data.status) : status;
      if (newStatus !== status) {
        log = log + "Pipeline status: " + newStatus + "\n";
        status = newStatus;
      }
    }

    log = log + "\n" + (await this.readJobLogs(pipelineId));

    if (status !== "success") {
      throw new StepError("GitLab pipeline " + status, log);
    }

    // Terraform prints the outputs at the end of "apply", e.g.  container_id = "101"
    const match = log.match(/(container_id|instance_id)\s*=\s*"?([\w-]+)"?/);
    const externalId = match ? match[2] : "gitlab-pipeline-" + pipelineId;
    return { externalId: externalId, log: log };
  }

  async provision(request: Request): Promise<StepResult> {
    if (!request.terraformCode) {
      throw new StepError("No Terraform code was generated for this request", "");
    }

    // 1. Commit main.tf to requests/request-<id>/main.tf
    const filePath = "requests/request-" + request.id + "/main.tf";
    const exists = await this.fileExists(filePath);
    const commit = await this.callGitLab("POST", "/repository/commits", {
      branch: config.gitlab.branch,
      commit_message: "Infra Portal: request #" + request.id + " (" + request.hostname + ")",
      actions: [
        {
          action: exists ? "update" : "create",
          file_path: filePath,
          content: request.terraformCode,
        },
      ],
    });
    if (!commit.ok) {
      throw new StepError(
        "Could not commit main.tf to GitLab (HTTP " + commit.status + ")",
        JSON.stringify(commit.data) + "\n"
      );
    }
    const log = "Committed " + filePath + " (" + commit.data.short_id + "): " + commit.data.web_url + "\n";

    // 2. Run the pipeline. AWS servers are only checked unless real AWS is switched on (avoids cloud cost).
    if (request.platform === "AWS" && !config.terraform.awsApplyEnabled) {
      const result = await this.runPipeline(request, "validate", log);
      result.externalId = "aws-validated-only";
      result.log = result.log + "AWS_APPLY_ENABLED is false, so the code was validated but not applied.\n";
      return result;
    }
    return this.runPipeline(request, "apply", log);
  }

  async destroy(request: Request): Promise<StepResult> {
    // Nothing was created for validate-only AWS requests.
    if (request.externalId === "aws-validated-only") {
      return { log: "Nothing to destroy: this AWS request was only validated.\n" };
    }
    return this.runPipeline(request, "destroy", "");
  }
}

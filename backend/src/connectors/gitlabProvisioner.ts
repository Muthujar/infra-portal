// Runs Terraform through a GitLab CI pipeline instead of on this machine.
// Flow: commit main.tf to the GitLab repo -> start a pipeline -> wait until it finishes.
// The pipeline itself is defined in gitlab/.gitlab-ci.yml (at the root of this repo).
// GitLab API docs: https://docs.gitlab.com/ee/api/commits.html and https://docs.gitlab.com/ee/api/pipelines.html

import { Request } from "@prisma/client";
import { config } from "../config";
import { Provisioner, StepResult, StepError, sleep } from "./types";

const POLL_EVERY_MS = 10000;
const GIVE_UP_AFTER_MS = 30 * 60 * 1000; // 30 minutes

export class GitLabProvisioner implements Provisioner {
  name = "gitlab";

  private apiUrl(pathPart: string): string {
    const projectId = encodeURIComponent(config.gitlab.projectId);
    return config.gitlab.url + "/api/v4/projects/" + projectId + pathPart;
  }

  private async callGitLab(method: string, pathPart: string, body?: unknown) {
    const response = await fetch(this.apiUrl(pathPart), {
      method: method,
      headers: {
        "PRIVATE-TOKEN": config.gitlab.token,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data: any = null;
    if (text) {
      data = JSON.parse(text);
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

  // Starts a pipeline and waits until it is finished.
  private async runPipeline(request: Request, action: "apply" | "destroy", log: string): Promise<StepResult> {
    const start = await this.callGitLab("POST", "/pipeline", {
      ref: config.gitlab.branch,
      variables: [
        { key: "REQUEST_ID", value: String(request.id) },
        { key: "TF_ACTION", value: action },
      ],
    });
    if (!start.ok) {
      throw new StepError("Could not start GitLab pipeline (HTTP " + start.status + ")", log + JSON.stringify(start.data));
    }

    const pipelineId = String(start.data.id);
    log = log + "Started pipeline " + pipelineId + ": " + start.data.web_url + "\n";

    const startedAt = Date.now();
    while (Date.now() - startedAt < GIVE_UP_AFTER_MS) {
      await sleep(POLL_EVERY_MS);
      const check = await this.callGitLab("GET", "/pipelines/" + pipelineId);
      const status = check.data ? check.data.status : "unknown";
      log = log + "Pipeline status: " + status + "\n";

      if (status === "success") {
        return { externalId: "gitlab-pipeline-" + pipelineId, log: log };
      }
      if (status === "failed" || status === "canceled" || status === "skipped") {
        throw new StepError("GitLab pipeline " + status, log);
      }
    }
    throw new StepError("GitLab pipeline did not finish in 30 minutes", log);
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
      throw new StepError("Could not commit main.tf to GitLab (HTTP " + commit.status + ")", JSON.stringify(commit.data));
    }
    let log = "Committed " + filePath + " (" + commit.data.short_id + ")\n";

    // 2. Run the pipeline with TF_ACTION=apply
    return this.runPipeline(request, "apply", log);
  }

  async destroy(request: Request): Promise<StepResult> {
    return this.runPipeline(request, "destroy", "");
  }
}

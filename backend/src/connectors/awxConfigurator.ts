// Launches a real AWX job template and waits for it to finish.
// AWX API docs: https://ansible.readthedocs.io/projects/awx/en/latest/rest_api/

import { Request } from "@prisma/client";
import { config } from "../config";
import { Configurator, StepResult, StepError, sleep } from "./types";

const POLL_EVERY_MS = 5000;
const GIVE_UP_AFTER_MS = 20 * 60 * 1000; // 20 minutes

export class AwxConfigurator implements Configurator {
  name = "awx";

  private async callAwx(method: string, pathPart: string, body?: unknown) {
    const response = await fetch(config.awx.url + pathPart, {
      method: method,
      headers: {
        Authorization: "Bearer " + config.awx.token,
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

  async configure(request: Request): Promise<StepResult> {
    // 1. Launch the job template. extra_vars are passed to the Ansible playbook.
    const launch = await this.callAwx("POST", "/api/v2/job_templates/" + config.awx.jobTemplateId + "/launch/", {
      limit: request.hostname,
      extra_vars: {
        target_hostname: request.hostname,
        request_id: request.id,
        environment: request.environment,
      },
    });
    if (!launch.ok) {
      throw new StepError("Could not launch AWX job (HTTP " + launch.status + ")", JSON.stringify(launch.data));
    }

    const jobId = String(launch.data.job);
    let log = "Launched AWX job " + jobId + "\n";

    // 2. Wait until the job is finished.
    const startedAt = Date.now();
    while (Date.now() - startedAt < GIVE_UP_AFTER_MS) {
      await sleep(POLL_EVERY_MS);
      const check = await this.callAwx("GET", "/api/v2/jobs/" + jobId + "/");
      const status = check.data ? check.data.status : "unknown";
      log = log + "AWX job status: " + status + "\n";

      if (status === "successful") {
        return { externalId: jobId, log: log };
      }
      if (status === "failed" || status === "error" || status === "canceled") {
        throw new StepError("AWX job " + status, log);
      }
    }
    throw new StepError("AWX job did not finish in 20 minutes", log);
  }
}

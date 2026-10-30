// Runs the real Terraform CLI on this machine.
// With PROVISIONER=local this creates real containers in Proxmox.

import fs from "fs";
import path from "path";
import { Request } from "@prisma/client";
import { config } from "../config";
import { getRequestFolder, readOutputs, runTerraform, writeMainTf } from "../terraform/runner";
import { Provisioner, StepResult, StepError } from "./types";

export class LocalTerraformProvisioner implements Provisioner {
  name = "local-terraform";

  async provision(request: Request): Promise<StepResult> {
    if (!request.terraformCode) {
      throw new StepError("No Terraform code was generated for this request", "");
    }

    // 1. Write main.tf into the request's own folder
    const folder = writeMainTf(request.id, request.terraformCode);
    let log = "Working folder: " + folder + "\n\n";

    // 2. terraform init (downloads the provider plugin the first time)
    const init = await runTerraform(folder, ["init", "-input=false", "-no-color"]);
    log = log + init.output + "\n";
    if (init.exitCode !== 0) {
      throw new StepError("terraform init failed", log);
    }

    // 3. AWS: only check the code unless real AWS is switched on (avoids cloud cost)
    if (request.platform === "AWS" && !config.terraform.awsApplyEnabled) {
      const validate = await runTerraform(folder, ["validate", "-no-color"]);
      log = log + validate.output + "\n";
      if (validate.exitCode !== 0) {
        throw new StepError("terraform validate failed", log);
      }
      log = log + "AWS_APPLY_ENABLED is false, so the code was validated but not applied.\n";
      return { externalId: "aws-validated-only", log: log };
    }

    // 4. terraform apply
    const apply = await runTerraform(folder, ["apply", "-auto-approve", "-input=false", "-no-color"]);
    log = log + apply.output + "\n";
    if (apply.exitCode !== 0) {
      throw new StepError("terraform apply failed", log);
    }

    // 5. Read outputs such as container_id or instance_id
    const outputs = await readOutputs(folder);
    const externalId = outputs.container_id || outputs.instance_id || "";
    return { externalId: externalId, log: log };
  }

  async destroy(request: Request): Promise<StepResult> {
    const folder = getRequestFolder(request.id);
    const stateFile = path.join(folder, "terraform.tfstate");

    // Nothing was ever created (e.g. AWS validate-only, or it failed before apply).
    if (!fs.existsSync(stateFile)) {
      return { log: "No Terraform state found, nothing to destroy.\n" };
    }

    const destroy = await runTerraform(folder, ["destroy", "-auto-approve", "-input=false", "-no-color"]);
    if (destroy.exitCode !== 0) {
      throw new StepError("terraform destroy failed", destroy.output);
    }
    return { log: destroy.output };
  }
}

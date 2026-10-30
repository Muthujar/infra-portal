// Pretends to run Terraform. Useful for demos without Proxmox or AWS.

import { Request } from "@prisma/client";
import { config } from "../config";
import { Provisioner, StepResult, StepError, sleep } from "./types";

export class MockProvisioner implements Provisioner {
  name = "mock";

  async provision(request: Request): Promise<StepResult> {
    let log = "[mock] terraform init\n";
    log = log + "[mock] Initializing provider plugins...\n";
    await sleep(config.mockStepDelayMs);

    // Lets you demo the failure path: a hostname containing "fail" always fails.
    if (request.hostname.includes("fail")) {
      log = log + "[mock] Error: no free IP address in the network\n";
      throw new StepError("Simulated Terraform failure (hostname contains 'fail')", log);
    }

    const fakeId = String(1000 + request.id);
    log = log + "[mock] terraform apply -auto-approve\n";
    log = log + "[mock] Creating " + request.hostname + " on " + request.platform + "...\n";
    log = log + "[mock] Apply complete! Resources: 1 added, 0 changed, 0 destroyed.\n";
    log = log + "[mock] container_id = " + fakeId + "\n";
    return { externalId: fakeId, log: log };
  }

  async destroy(request: Request): Promise<StepResult> {
    await sleep(config.mockStepDelayMs);
    let log = "[mock] terraform destroy -auto-approve\n";
    log = log + "[mock] Destroying " + request.hostname + "...\n";
    log = log + "[mock] Destroy complete! Resources: 1 destroyed.\n";
    return { log: log };
  }
}

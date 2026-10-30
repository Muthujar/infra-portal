// Pretends to run an AWX job (Ansible playbook) that sets up the new server.

import { Request } from "@prisma/client";
import { config } from "../config";
import { Configurator, StepResult, sleep } from "./types";

export class MockConfigurator implements Configurator {
  name = "mock";

  async configure(request: Request): Promise<StepResult> {
    await sleep(config.mockStepDelayMs);
    const fakeJobId = String(5000 + request.id);

    let log = "[mock AWX] Launched job template 'configure-server' as job " + fakeJobId + "\n";
    log = log + "[mock AWX] PLAY [Configure new server] ****\n";
    log = log + "[mock AWX] TASK [Update apt cache] ok\n";
    log = log + "[mock AWX] TASK [Install base packages: curl, git, ufw] changed\n";
    log = log + "[mock AWX] TASK [Create app user] changed\n";
    log = log + "[mock AWX] TASK [Enable firewall, allow SSH] changed\n";
    log = log + "[mock AWX] PLAY RECAP: " + request.hostname + " ok=4 changed=3 failed=0\n";
    return { externalId: fakeJobId, log: log };
  }
}

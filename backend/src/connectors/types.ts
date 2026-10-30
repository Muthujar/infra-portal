// Shared types for the connectors.
// A "connector" is the code that talks to an outside system (Terraform, GitLab, AWX).
// Every connector has a mock version and a real version with the SAME functions,
// so the worker does not care which one it is using.

import { Request } from "@prisma/client";

export interface StepResult {
  externalId?: string; // e.g. container id, pipeline id, AWX job id
  log: string; // text shown on the request page
}

// Creates and deletes the server (Terraform, directly or through GitLab CI).
export interface Provisioner {
  name: string;
  provision(request: Request): Promise<StepResult>;
  destroy(request: Request): Promise<StepResult>;
}

// Sets up software inside the server after it exists (Ansible through AWX).
export interface Configurator {
  name: string;
  configure(request: Request): Promise<StepResult>;
}

// Thrown when a step fails. It carries the log so the user can see what went wrong.
export class StepError extends Error {
  log: string;

  constructor(message: string, log: string) {
    super(message);
    this.log = log;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

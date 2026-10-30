// Runs the Terraform command line tool (terraform init / apply / destroy).
// Each request gets its own folder, so each server has its own Terraform state.

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { config } from "../config";

export interface CommandResult {
  exitCode: number;
  output: string;
}

export function getRequestFolder(requestId: number): string {
  return path.resolve(config.terraform.workdir, "request-" + requestId);
}

export function writeMainTf(requestId: number, terraformCode: string): string {
  const folder = getRequestFolder(requestId);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "main.tf"), terraformCode, "utf8");
  return folder;
}

// Secrets are given to Terraform as environment variables (TF_VAR_*),
// so they never appear in main.tf or in the database.
function buildTerraformEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.TF_IN_AUTOMATION = "true";
  env.TF_VAR_proxmox_endpoint = config.proxmox.endpoint;
  env.TF_VAR_proxmox_api_token = config.proxmox.apiToken;
  env.TF_VAR_container_password = config.proxmox.containerPassword;
  return env;
}

// Runs one terraform command and collects everything it prints.
export function runTerraform(folder: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    let output = "$ terraform " + args.join(" ") + "\n";

    const child = spawn(config.terraform.bin, args, {
      cwd: folder,
      env: buildTerraformEnv(),
    });

    child.stdout.on("data", (chunk) => {
      output = output + chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output = output + chunk.toString();
    });

    // For example: terraform is not installed.
    child.on("error", (error) => {
      output = output + "\nCould not start terraform: " + error.message + "\n";
      resolve({ exitCode: -1, output: output });
    });

    child.on("close", (code) => {
      resolve({ exitCode: code === null ? -1 : code, output: output });
    });
  });
}

// Reads the outputs (e.g. container_id) after a successful apply.
export async function readOutputs(folder: string): Promise<Record<string, string>> {
  const result = await runTerraform(folder, ["output", "-json", "-no-color"]);
  const outputs: Record<string, string> = {};
  if (result.exitCode !== 0) {
    return outputs;
  }

  // The first line is the "$ terraform ..." line we added, the rest is JSON.
  const jsonText = result.output.substring(result.output.indexOf("\n") + 1);
  try {
    const parsed = JSON.parse(jsonText) as Record<string, { value: unknown }>;
    const names = Object.keys(parsed);
    for (const name of names) {
      outputs[name] = String(parsed[name].value);
    }
  } catch {
    // Outputs are nice to have; ignore if they cannot be read.
  }
  return outputs;
}

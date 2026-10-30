// Generates Terraform (HCL) code for a request.
// The idea is simple: read a template file and replace every {{placeholder}} with a value.

import fs from "fs";
import path from "path";
import { Request, Team, User } from "@prisma/client";
import { config } from "../config";

// Works from both src/terraform (dev) and dist/terraform (build).
const TEMPLATE_FOLDER = path.join(__dirname, "..", "..", "terraform-templates");

type RequestWithRelations = Request & {
  requester: User;
  team: Team;
  catalogItem: { awsInstanceType: string | null };
};

function fillTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  const keys = Object.keys(values);
  for (const key of keys) {
    const placeholder = "{{" + key + "}}";
    result = result.split(placeholder).join(values[key]);
  }

  // Safety check: every placeholder must have been replaced.
  const leftover = result.match(/\{\{(\w+)\}\}/);
  if (leftover) {
    throw new Error("Terraform template value missing: " + leftover[1]);
  }
  return result;
}

// Tags in Proxmox may only contain letters, numbers, - and _
function toTag(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

export function generateTerraform(request: RequestWithRelations): string {
  // Values that are the same for every platform.
  const commonValues: Record<string, string> = {
    requestId: String(request.id),
    hostname: request.hostname,
    environment: request.environment,
    environmentTag: toTag(request.environment),
    teamTag: toTag(request.team.name),
    requesterEmail: request.requester.email,
    cpu: String(request.cpu),
    memoryMb: String(request.memoryMb),
    diskGb: String(request.diskGb),
  };

  if (request.platform === "PROXMOX") {
    const template = fs.readFileSync(path.join(TEMPLATE_FOLDER, "proxmox-lxc.tf.tpl"), "utf8");
    const values = {
      ...commonValues,
      proxmoxNode: config.proxmox.node,
      proxmoxDatastore: config.proxmox.datastore,
      proxmoxTemplate: config.proxmox.lxcTemplate,
      proxmoxBridge: config.proxmox.bridge,
    };
    return fillTemplate(template, values);
  }

  if (request.platform === "AWS") {
    const template = fs.readFileSync(path.join(TEMPLATE_FOLDER, "aws-ec2.tf.tpl"), "utf8");
    const values = {
      ...commonValues,
      awsRegion: config.aws.region,
      awsInstanceType: request.catalogItem.awsInstanceType || "t3.micro",
    };
    return fillTemplate(template, values);
  }

  throw new Error("Unsupported platform: " + request.platform);
}

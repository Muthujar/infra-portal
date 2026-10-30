// Reads all settings from environment variables (.env file) in one place.

import dotenv from "dotenv";

dotenv.config();

function readString(name: string, defaultValue: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return defaultValue;
  }
  return value;
}

function readNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return defaultValue;
  }
  return Number(value);
}

export const config = {
  port: readNumber("PORT", 4000),
  databaseUrl: readString("DATABASE_URL", ""),
  redisUrl: readString("REDIS_URL", "redis://localhost:6379"),
  jwtSecret: readString("JWT_SECRET", "dev-secret-change-me"),
  webOrigin: readString("WEB_ORIGIN", "http://localhost:5173"),

  provisioner: readString("PROVISIONER", "mock"), // mock | local | gitlab
  configurator: readString("CONFIGURATOR", "mock"), // mock | awx
  mockStepDelayMs: readNumber("MOCK_STEP_DELAY_MS", 4000),

  terraform: {
    workdir: readString("TERRAFORM_WORKDIR", "./terraform-runs"),
    bin: readString("TERRAFORM_BIN", "terraform"),
    awsApplyEnabled: readString("AWS_APPLY_ENABLED", "false") === "true",
  },

  proxmox: {
    endpoint: readString("PROXMOX_ENDPOINT", ""),
    apiToken: readString("PROXMOX_API_TOKEN", ""),
    node: readString("PROXMOX_NODE", "pve"),
    datastore: readString("PROXMOX_DATASTORE", "local-lvm"),
    lxcTemplate: readString(
      "PROXMOX_LXC_TEMPLATE",
      "local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst"
    ),
    bridge: readString("PROXMOX_BRIDGE", "vmbr0"),
    containerPassword: readString("PROXMOX_CONTAINER_PASSWORD", "ChangeMe@123"),
  },

  aws: {
    region: readString("AWS_REGION", "ap-south-1"),
  },

  gitlab: {
    url: readString("GITLAB_URL", "https://gitlab.com"),
    token: readString("GITLAB_TOKEN", ""),
    projectId: readString("GITLAB_PROJECT_ID", ""),
    branch: readString("GITLAB_BRANCH", "main"),
  },

  awx: {
    url: readString("AWX_URL", ""),
    token: readString("AWX_TOKEN", ""),
    jobTemplateId: readString("AWX_JOB_TEMPLATE_ID", ""),
  },
};

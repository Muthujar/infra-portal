// Writes example main.tf files from the templates, so `terraform validate` can check them.
// Used by CI. Run with: npx tsx scripts/render-sample-terraform.ts <output-folder>
// Each platform gets its own folder: <output-folder>/proxmox/main.tf and <output-folder>/aws/main.tf

import fs from "fs";
import path from "path";
import { Request, Team, User } from "@prisma/client";
import { generateTerraform } from "../src/terraform/generator";

const outputFolder = process.argv[2] || "terraform-check";

function sampleRequest(platform: "PROXMOX" | "AWS") {
  const request = {
    id: 1,
    hostname: "sample-server",
    environment: "DEV",
    platform: platform,
    cpu: 1,
    memoryMb: 1024,
    diskGb: 8,
  } as Request;
  return {
    ...request,
    requester: { email: "dev@demo.local" } as User,
    team: { name: "Payments" } as Team,
    catalogItem: { awsInstanceType: "t3.micro" },
  };
}

const platforms: ("PROXMOX" | "AWS")[] = ["PROXMOX", "AWS"];
for (const platform of platforms) {
  const folder = path.join(outputFolder, platform.toLowerCase());
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "main.tf"), generateTerraform(sampleRequest(platform)), "utf8");
  console.log("Wrote " + path.join(folder, "main.tf"));
}

import { describe, expect, it } from "vitest";
import { Request, Team, User } from "@prisma/client";
import { generateTerraform } from "../src/terraform/generator";

// A request object like the one the API passes to the generator (only the fields it reads matter).
function sampleRequest(platform: "PROXMOX" | "AWS", awsInstanceType: string | null) {
  const request = {
    id: 42,
    hostname: "web-01",
    environment: "DEV",
    platform: platform,
    cpu: 2,
    memoryMb: 2048,
    diskGb: 20,
  } as Request;
  return {
    ...request,
    requester: { email: "dev@demo.local" } as User,
    team: { name: "Payments Team" } as Team,
    catalogItem: { awsInstanceType: awsInstanceType },
  };
}

describe("Terraform generator", () => {
  it("fills the Proxmox LXC template with the request values", () => {
    const code = generateTerraform(sampleRequest("PROXMOX", null));

    expect(code).toContain('resource "proxmox_virtual_environment_container" "server"');
    expect(code).toContain('hostname = "web-01"');
    expect(code).toContain("cores = 2");
    expect(code).toContain("dedicated = 2048");
    expect(code).toContain("size         = 20");
    expect(code).toContain('"team-payments-team"');
    expect(code).not.toMatch(/\{\{\w+\}\}/);
  });

  it("never writes secrets into the generated file", () => {
    const code = generateTerraform(sampleRequest("PROXMOX", null));
    expect(code).toContain("var.proxmox_api_token");
    expect(code).toContain("var.container_password");
    expect(code).not.toContain("ChangeMe@123");
  });

  it("fills the AWS EC2 template with the catalog instance type", () => {
    const code = generateTerraform(sampleRequest("AWS", "t3.medium"));
    expect(code).toContain("t3.medium");
    expect(code).toContain("web-01");
    expect(code).not.toMatch(/\{\{\w+\}\}/);
  });
});

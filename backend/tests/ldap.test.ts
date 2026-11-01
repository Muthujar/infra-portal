// LDAP login. The group mapping tests always run.
// The login tests need the demo directory from ldap/bootstrap.ldif and run when LDAP_TEST_URL is set (CI sets it):
//   docker run -d -p 3389:389 -e LDAP_DOMAIN=corp.local -e LDAP_ADMIN_PASSWORD=admin \
//     -v $PWD/ldap/bootstrap.ldif:/container/service/slapd/assets/config/bootstrap/ldif/custom/50-portal.ldif \
//     osixia/openldap:1.5.0 --copy-service
//   LDAP_TEST_URL=ldap://localhost:3389 npm test

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../src/config";
import { roleFromGroups, teamFromGroups } from "../src/services/ldap.service";
import { app, DEMO_PASSWORD } from "./helpers";

describe("LDAP group mapping", () => {
  it("gives the strongest role the person has", () => {
    expect(roleFromGroups(["portal-requesters", "portal-admins"])).toBe("ADMIN");
    expect(roleFromGroups(["team-payments", "portal-approvers"])).toBe("APPROVER");
    expect(roleFromGroups(["portal-requesters"])).toBe("REQUESTER");
    expect(roleFromGroups(["team-payments"])).toBeNull();
  });

  it("reads the team from a team-<name> group", () => {
    expect(teamFromGroups(["portal-approvers", "team-payments"])).toBe("payments");
    expect(teamFromGroups(["portal-approvers"])).toBeNull();
  });
});

const ldapUrl = process.env.LDAP_TEST_URL;

describe.runIf(ldapUrl)("LDAP login against the demo directory", () => {
  beforeAll(() => {
    config.ldap.url = ldapUrl as string;
    config.ldap.bindDn = "cn=admin,dc=corp,dc=local";
    config.ldap.bindPassword = "admin";
    config.ldap.userBase = "ou=people,dc=corp,dc=local";
    config.ldap.groupBase = "ou=groups,dc=corp,dc=local";
  });

  afterAll(() => {
    config.ldap.url = "";
  });

  async function ldapLogin(email: string, password: string) {
    return request(app).post("/api/auth/login").send({ email: email, password: password });
  }

  it("logs in a directory user with the role and team from their groups", async () => {
    const response = await ldapLogin("ravi@corp.local", "Password@123");
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("APPROVER");
    expect(response.body.user.teamName).toBe("Payments");
    expect(response.body.user.name).toBe("Ravi (Team Lead)");

    const admin = await ldapLogin("sana@corp.local", "Password@123");
    expect(admin.body.user.role).toBe("ADMIN");
    expect(admin.body.user.teamName).toBe("Platform");
  });

  it("rejects a wrong directory password", async () => {
    const response = await ldapLogin("meera@corp.local", "wrong-password");
    expect(response.status).toBe(401);
  });

  it("refuses a directory user who is in no portal group", async () => {
    const response = await ldapLogin("guest@corp.local", "Password@123");
    expect(response.status).toBe(403);
  });

  it("still lets the demo users in, because they are not in the directory", async () => {
    const response = await ldapLogin("dev@demo.local", DEMO_PASSWORD);
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("REQUESTER");
  });

  it("reports that LDAP is on", async () => {
    const response = await request(app).get("/api/auth/options");
    expect(response.body.ldap).toBe(true);
  });

  it("falls back to the demo users when the directory is down", async () => {
    config.ldap.url = "ldap://127.0.0.1:1"; // nothing listens here
    const response = await ldapLogin("lead@demo.local", DEMO_PASSWORD);
    config.ldap.url = ldapUrl as string;
    expect(response.status).toBe(200);
  });
});

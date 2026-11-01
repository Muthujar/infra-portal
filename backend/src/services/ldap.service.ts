// Company login with LDAP (for example OpenLDAP or Active Directory).
// Only used when LDAP_URL is set. Guide: docs/ldap.md
//
// Steps for one login:
//   1. Connect with the service account (LDAP_BIND_DN) and look up the person by email.
//   2. Check their password by connecting again as that person.
//   3. Read which groups they are in. The groups decide the portal role and team.

import { Client, EqualityFilter, AndFilter } from "ldapts";
import { Role } from "@prisma/client";
import { config } from "../config";
import { HttpError } from "../errors";

export interface DirectoryUser {
  email: string;
  name: string;
  groups: string[]; // group names (cn), e.g. ["portal-approvers", "team-payments"]
}

export function ldapEnabled(): boolean {
  return config.ldap.url !== "";
}

function firstValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? String(value[0]) : "";
  }
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

// Returns the person from the directory, or null when the email is not in the directory
// (then the portal's own users are tried). Throws 401 for a wrong password.
export async function authenticateWithLdap(email: string, password: string): Promise<DirectoryUser | null> {
  const client = new Client({ url: config.ldap.url, timeout: 5000, connectTimeout: 5000 });

  try {
    // 1. Find the person. EqualityFilter escapes special characters, so an email cannot change the query.
    await client.bind(config.ldap.bindDn, config.ldap.bindPassword);
    const people = await client.search(config.ldap.userBase, {
      scope: "sub",
      filter: new EqualityFilter({ attribute: "mail", value: email }),
      attributes: ["cn", "mail"],
    });
    if (people.searchEntries.length === 0) {
      return null;
    }
    const person = people.searchEntries[0];
    await client.unbind();

    // 2. Check the password by logging in to the directory as this person.
    try {
      await client.bind(person.dn, password);
    } catch {
      throw new HttpError(401, "Invalid email or password");
    }
    await client.unbind();

    // 3. Read the groups this person is a member of.
    await client.bind(config.ldap.bindDn, config.ldap.bindPassword);
    const groupResult = await client.search(config.ldap.groupBase, {
      scope: "sub",
      filter: new AndFilter({
        filters: [
          new EqualityFilter({ attribute: "objectClass", value: "groupOfNames" }),
          new EqualityFilter({ attribute: "member", value: person.dn }),
        ],
      }),
      attributes: ["cn"],
    });

    const groups: string[] = [];
    for (const group of groupResult.searchEntries) {
      groups.push(firstValue(group.cn));
    }

    return { email: email, name: firstValue(person.cn) || email, groups: groups };
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

// Turns directory groups into a portal role. The strongest role wins.
// Returns null when the person is in none of the portal groups.
export function roleFromGroups(groups: string[]): Role | null {
  if (groups.includes(config.ldap.adminGroup)) {
    return "ADMIN";
  }
  if (groups.includes(config.ldap.approverGroup)) {
    return "APPROVER";
  }
  if (groups.includes(config.ldap.requesterGroup)) {
    return "REQUESTER";
  }
  return null;
}

// Returns the team name from the first group like "team-payments", or null.
export function teamFromGroups(groups: string[]): string | null {
  for (const group of groups) {
    if (group.startsWith(config.ldap.teamGroupPrefix)) {
      return group.substring(config.ldap.teamGroupPrefix.length);
    }
  }
  return null;
}

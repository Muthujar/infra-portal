# Set up company login with LDAP

With LDAP on, people log in with their company email and password. **Directory groups set their portal role and team.** LDAP is off by default.

| Directory group | Portal result |
|---|---|
| `portal-admins` | Admin |
| `portal-approvers` | Approver |
| `portal-requesters` | Requester |
| `team-<name>`, such as `team-payments` | Team `<name>`, which must exist in the portal |
| None of the role groups | Login refused |

If the directory cannot be reached, the portal falls back to its own users.

## Try the demo directory

1. In `backend/.env`, uncomment the `LDAP_*` lines:

   ```
   LDAP_URL=ldap://ldap:389
   LDAP_BIND_DN=cn=admin,dc=corp,dc=local
   LDAP_BIND_PASSWORD=admin
   LDAP_USER_BASE=ou=people,dc=corp,dc=local
   LDAP_GROUP_BASE=ou=groups,dc=corp,dc=local
   ```

2. Start the portal with the `ldap` profile:

   ```bash
   docker compose --profile ldap up -d --build
   docker compose up -d --force-recreate api
   ```

3. Log in at http://localhost:8080 with password `Password@123`:

   | Email | Result |
   |---|---|
   | `meera@corp.local` | Requester, Payments |
   | `ravi@corp.local` | Approver, Payments |
   | `sana@corp.local` | Admin, Platform |
   | `guest@corp.local` | Refused, no role group |

The demo users still work.

## Use a real directory

Set the same values to your company's server and a read-only service account. Set `LDAP_ADMIN_GROUP`, `LDAP_APPROVER_GROUP`, `LDAP_REQUESTER_GROUP` and `LDAP_TEAM_GROUP_PREFIX` to your group names.

Use `ldaps://` so passwords are encrypted. For Active Directory, you may need to adjust the search filters in `backend/src/services/ldap.service.ts`.

**SAML** is the next step. It would replace the password form with the company login page and keep the same group-to-role mapping.

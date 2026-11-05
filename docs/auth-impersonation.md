# Impersonation UX and restricted-action guide

A platform admin (superuser) can act as another user to debug or support them. This page says
what that session sees and what it may not do, and how the `AUTHZ_PLATFORM_UI` switch changes it.

## The switch

`AUTHZ_PLATFORM_UI` takes exactly one of these values. Any other value (also `Enforce` or
` enforce`) is `off`.

| Value     | Effect                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `off`     | Default. The behavior below under "Always" only.                                                                              |
| `shadow`  | As `off`, plus one advisory log line per platform surface (the policy verdict next to what the UI did). Nothing else changes. |
| `enforce` | As `off`, plus the limits under "Enforce only".                                                                               |

Rollout: the chart keeps the switch off. `enforce` waits for the go-api side of the organization
write limits and an explicit go word.

## Always (every mode)

- `/superadmin/*` pages do not render for an impersonating session (silent redirect to
  `/dashboard` in `off` and `shadow`).
- Every platform server action refuses an impersonating session with 403
  "Not available while impersonating" and makes no backend call. Only Stop impersonation and the
  impersonation status read pass.
- The superuser bypass of the organization admin guard does not apply while impersonating: the
  impersonated user's own role decides.

## Enforce only

The web reads the impersonation status on the server (the 3 s status memo), never a flag the
browser holds. A superuser session whose status cannot be read is treated as impersonating
(fail closed).

- `/superadmin/*` sends the session to `/impersonation-restricted`: a notice that names
  **Stop Impersonating** in the banner as the way back. In `off` and `shadow` that page does not
  exist (404).
- The Platform nav rows, the Platform admin pill and both Impersonate controls are hidden.
- Organization writes are refused with the same 403 shape and one log line
  `impersonation_limit` with the fields `action`, `cause` (`impersonating` or `status_unknown`)
  and `surface` (no token, user id or organization id). Their controls are hidden.

| Web surface                            | Catalog action       |
| -------------------------------------- | -------------------- |
| `updateCurrentOrg`, `updateOrgProfile` | `org.write`          |
| `deleteCurrentOrg`                     | `org.delete`         |
| `createUser`                           | `members.invite`     |
| `updateUser`                           | `members.update`     |
| `deleteUser`, `setUserPassword`        | `members.manage`     |
| GitHub App install and callback routes | `integrations.write` |

Organization reads (settings, members, current organization) keep working. Stop impersonation
always works.

## Denied actions

Platform actions (all refused while impersonating, except the end and the status read of the
impersonation): `admin.users`, `admin.orgs`, `admin.impersonate`, `admin.billing`, `admin.flags`,
`admin.audit`, `admin.telemetry`, `admin.stats`, `authz.decide`, `credentials.project`.

Organization actions the catalog denies to a delegated (impersonation) session:
`settings.write`, `reports.write`, `integrations.write`, `members.invite`, `members.manage`,
`members.update`, `org.write`, `org.delete`, `billing.manage`, `acr.credential.issue`. The web
refuses those it has a surface for (table above); the backend refuses the rest.

## Reading the shadow log line

With `shadow`, each render writes one advisory line per platform surface: the surface id, the
action, what the UI did (`clientAllowed`) and the policy verdict. A row where the two differ is a
surface that `enforce` would change. The line never changes what a page renders.

# Forced sign-out

## When to use

Use this runbook to end a user's web sessions through a backend account or session action.
See the [authentication design and 60 s bound](../auth-system.md#authentication-flow).
Web enforces the backend refusal when it checks the session.

## Preconditions

- You have permission to manage the target user. Confirm which account must lose access.
- The backend can answer session checks. An outage and retry backoff can delay enforcement.
- For the drill, use a compose test venue with one web replica and throwaway users. Never use
  production. With several web replicas, each process checks sessions on its own.
- The drill needs the checkout's `node_modules/.bin/tsx`. Set `WEB_URL` to the test web URL,
  `API_URL` to the test API URL, and `TARGET_USER_ID` to the throwaway target user's ID.
- Set `DRILL_DIR` to an existing private directory with mode `0700`. Store `target.json`,
  `control.json`, and `admin.json` there with mode `0600`. Each file has `email` and `password`
  fields. Use two different users for target and control. The admin must manage the target's
  organization. Do not print these files or cookie jars.

## Steps

1. Open the target user in the organization admin user list. Select **Edit User**. Clear **Active**
   and select **Save Changes**. Check that the save succeeds. This sends the account change to the
   backend.
2. If access must stay active, use backend controls to move the user's token version or revoke each
   backend session that must end. Revoking one session does not revoke the user's other sessions.
3. Record when the backend accepts the action. Follow the linked bound, then check each affected
   browser session with a request to a protected page.
4. To test the behavior, run this command from the repository root with the drill settings above:

    ```sh
    bash scripts/drills/session-forced-signout/drill.sh s1
    ```

    The drill uses the backend admin Delete action on the throwaway target. It checks two target
    sessions, old cookie copies, and a separate control session. Use the
    [recovery runbook](session-recovery.md) for the down/up checks.

## How to verify

The user's next protected-page request after the bound reaches sign-in. Check every affected
session. The control user must stay signed in.

The drill must exit with `rc=0` and no `FAIL:` records in `$DRILL_DIR/records/drill.txt`.
It reads the target sessions at 61 s after deactivation. Its session reads check for loss of the
session; also check the protected-page redirect in the browser.

## How to back out

For a deactivated user, open the same **Edit User** form. Select **Active** and **Save Changes**.
Confirm that the save succeeds. The user must sign in again. Reactivation does not restore cookies
that web has already invalidated. Revoked sessions and old token versions are not restored; the
user needs a new sign-in.

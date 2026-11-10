# Web session recovery

## When to use

Use this runbook when signed-in users report problems after an auth-service restart.
A web session is an Auth.js JWT cookie session.
See the [authentication design and forced sign-out bound](../auth-system.md#authentication-flow).

## Preconditions

- The user was signed in before the restart. Keep the same browser cookies.
- You can check and restore auth-service through the deployment controls.
- For the drill, use a compose test venue with one web replica and throwaway users. Never use
  production. Follow the [drill setup](forced-sign-out.md#preconditions).

## Steps

1. Confirm that auth-service is available again.
2. Ask the user to retry a protected page in the same browser. Do not clear cookies or start a new
   sign-in to recover from a transient outage.
3. Allow for validation retry backoff. A pending retry can wait up to 15 min.
4. If the session needs token refresh during the outage, web can show a retry page. Retry after the
   service recovers. A transient refresh failure keeps the refresh credential for a later attempt.
5. To test recovery, run the drill from the repository root. Run `s1` first to create the control
   session. Stop auth-service with the test venue's compose controls, then run:

    ```sh
    bash scripts/drills/session-forced-signout/drill.sh s3-down
    ```

6. Start auth-service with the same compose controls. Keep the same `DRILL_DIR` and cookie jars, then
   run:

    ```sh
    bash scripts/drills/session-forced-signout/drill.sh s3-up
    ```

## How to verify

The control session stays signed in on the read while auth-service is down and on the read after
it starts. Both drill verbs must exit with `rc=0`. No cookie is cleared and no new sign-in is made
between those reads. Check `$DRILL_DIR/records/drill.txt` without exposing credentials or cookie jars.

If the backend refuses the session after recovery, use the
[forced sign-out runbook](forced-sign-out.md). Validation cannot enforce a forced sign-out while
the backend cannot answer. Retry backoff can delay the check after recovery.

## How to back out

If the test fails, restore auth-service with the test venue's compose controls. Keep the control
cookie jar for another recovery check. Restore the throwaway user's Active setting as described in
the [forced sign-out back-out steps](forced-sign-out.md#how-to-back-out).

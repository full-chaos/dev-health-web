# GitHub OAuth Authentication

**Source of Truth:** [`src/lib/auth.ts`](../src/lib/auth.ts) · [`src/lib/config.ts`](../src/lib/config.ts)

> **Note:** This document covers **GitHub OAuth (social login)** via Auth.js/NextAuth. Dev Health can use the same GitHub App for both social login and the one-click GitHub App install flow documented in `ops/docs/user-guide/github-app-setup.md`; you do not need a separate GitHub OAuth App unless you want to manage login and installation as separate GitHub applications.

## Overview

GitHub social login is an optional provider in NextAuth.js v5. It is enabled only when `AUTH_GITHUB_ID` is set in the environment. See [`src/lib/auth.ts`](../src/lib/auth.ts).

```ts
...(authEnv.AUTH_GITHUB_ID
  ? [GitHub({ clientId: authEnv.AUTH_GITHUB_ID, clientSecret: authEnv.AUTH_GITHUB_SECRET! })]
  : []),
```

## Configuration

See [`src/lib/config.ts`](../src/lib/config.ts) for the runtime env schema.

| Variable             | Required                           | Description                                                                                  |
| -------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `AUTH_URL`           | Yes outside simple localhost dev   | Public web origin Auth.js uses to derive `redirect_uri`, for example `https://app.example.com`. |
| `AUTH_GITHUB_ID`     | Yes (to enable)                    | GitHub OAuth Client ID. Can be the same value as `GITHUB_APP_CLIENT_ID` in `ops/.env`.        |
| `AUTH_GITHUB_SECRET` | Yes (when `AUTH_GITHUB_ID` is set) | GitHub OAuth Client secret. Can be the same value as `GITHUB_APP_CLIENT_SECRET` in `ops/.env`. |

The ops backend must also know the same OAuth credentials so `/api/v1/auth/social-login`
can verify the GitHub access token before issuing a Dev Health session:

```dotenv
# ops/.env
SOCIAL_GITHUB_CLIENT_ID=<same Client ID>
SOCIAL_GITHUB_CLIENT_SECRET=<same client secret>
```

See [`docs/env-vars.md`](env-vars.md) for the full environment variable reference.

## Authentication flow

```
User clicks "Sign in with GitHub"
  → NextAuth redirects to github.com/login/oauth/authorize
  → User authorises the OAuth App
  → GitHub redirects to /api/auth/callback/github with ?code=...
  → NextAuth exchanges code for access_token (github.com/login/oauth/access_token)
  → NextAuth jwt() callback fires with account.provider = "github"
  → Frontend POSTs to backend /api/v1/auth/social-login
      { provider: "github", provider_access_token: <github_access_token> }
  → Backend validates the token with GitHub, creates/looks up user, returns backend JWT
  → NextAuth stores backend JWT + user metadata in its own session token
```

See [`src/lib/auth.ts`](../src/lib/auth.ts) for the JWT callback that exchanges the provider token for a backend session.

## Session data after GitHub login

The same session shape as credentials login:

| Field              | Source                                                          |
| ------------------ | --------------------------------------------------------------- |
| `access_token`     | Backend JWT returned by `/api/v1/auth/social-login`             |
| `role`             | User's role from backend                                        |
| `is_superuser`     | Boolean from backend                                            |
| `permissions`      | Empty array (social login does not return granular permissions) |
| `needs_onboarding` | Whether the user needs to complete onboarding                   |

## Checking which providers are enabled

```ts
import { getAvailableSocialProviders } from "@/lib/auth";
// Returns e.g. ["github", "google"] based on which env vars are set
const providers = getAvailableSocialProviders();
```

See [`getAvailableSocialProviders()`](../src/lib/auth.ts) for the provider list.

## Registering GitHub callbacks for local dev

You may either reuse the Dev Health GitHub App's Client ID/secret or create a
separate GitHub OAuth App. Reuse is the default for local development.

1. In the GitHub App's **Callback URLs**, add `http://localhost:3000/api/auth/callback/github`.
2. If using the GitHub App install/connect flow too, also add `http://localhost:3000/org/admin/integrations/github-app/callback`.
3. Copy the GitHub App **Client ID** and **Client secret**.
4. Add to `web/.env`:
    ```
    AUTH_URL=http://localhost:3000
    AUTH_GITHUB_ID=<client_id>
    AUTH_GITHUB_SECRET=<client_secret>
    ```
5. Add the same values to `ops/.env`:
    ```
    SOCIAL_GITHUB_CLIENT_ID=<client_id>
    SOCIAL_GITHUB_CLIENT_SECRET=<client_secret>
    ```
6. Restart the web and ops services. The GitHub button will appear on the sign-in page.

## Error handling

If the backend `/api/v1/auth/social-login` call fails or returns a non-OK response, `token.error` is set to `"social_login_failed"` and the session is marked as errored. See [`src/lib/auth.ts`](../src/lib/auth.ts).

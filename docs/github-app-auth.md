# GitHub OAuth Authentication

**Source of Truth:** [`src/lib/auth.ts`](../src/lib/auth.ts) · [`src/lib/config.ts`](../src/lib/config.ts)

> **Note:** This document covers **GitHub OAuth (social login)** via NextAuth.js. The app uses a standard GitHub OAuth App — not a GitHub App with installation tokens or private-key JWTs. There is no GitHub App installation flow in this codebase.

## Overview

GitHub social login is an optional provider in NextAuth.js v5. It is enabled only when `AUTH_GITHUB_ID` is set in the environment. ([`auth.ts:119`](../src/lib/auth.ts#L119))

```ts
...(authEnv.AUTH_GITHUB_ID
  ? [GitHub({ clientId: authEnv.AUTH_GITHUB_ID, clientSecret: authEnv.AUTH_GITHUB_SECRET! })]
  : []),
```

## Configuration

([`config.ts:83–84`](../src/lib/config.ts#L83))

| Variable             | Required                           | Description                                                      |
| -------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| `AUTH_GITHUB_ID`     | Yes (to enable)                    | GitHub OAuth App client ID. If absent, GitHub login is disabled. |
| `AUTH_GITHUB_SECRET` | Yes (when `AUTH_GITHUB_ID` is set) | GitHub OAuth App client secret.                                  |

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

([`auth.ts:138–174`](../src/lib/auth.ts#L138))

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

([`auth.ts:369–376`](../src/lib/auth.ts#L369))

## Registering a GitHub OAuth App for local dev

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Set **Homepage URL** to `http://localhost:3000`.
3. Set **Authorization callback URL** to `http://localhost:3000/api/auth/callback/github`.
4. Copy the **Client ID** and generate a **Client secret**.
5. Add to your `.env.local`:
   ```
   AUTH_GITHUB_ID=<client_id>
   AUTH_GITHUB_SECRET=<client_secret>
   ```
6. Restart the dev server. The GitHub button will appear on the sign-in page.

## Error handling

If the backend `/api/v1/auth/social-login` call fails or returns a non-OK response, `token.error` is set to `"social_login_failed"` and the session is marked as errored. ([`auth.ts:163–173`](../src/lib/auth.ts#L163))

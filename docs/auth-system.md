# Authentication System

Documentation for the dev-health-web authentication and authorization architecture.

## Overview

The system uses **NextAuth.js v5 (beta)** with the `CredentialsProvider`.

- **Central Config**: `src/lib/auth.ts`
- **Exports**: `auth`, `handlers`, `signIn`, `signOut`
- **Provider**: Custom `CredentialsProvider` authenticating against the backend API.

## Authentication Flow

1. User submits credentials via `/auth/signin`.
2. `CredentialsProvider` calls backend `/api/v1/auth/login`.
3. Backend returns JWT and user metadata.
4. NextAuth stores the backend token and user info in its own session/JWT.

**Session Data**:

- `access_token`: Backend API bearer token
- `role`: User's primary role (e.g., "admin", "viewer")
- `is_superuser`: Boolean flag for global access
- `permissions`: Array of specific permission strings

## User Journeys

All supported **authentication** journeys documented below. Each includes a Mermaid diagram and test coverage annotations showing where the journey is verified.

> For non-auth journeys (onboarding, admin, user, platform admin), see [User Journeys](user-journeys/README.md).

### Authentication

#### Registration

New user creates an account. Backend auto-creates user, organization, and owner membership in a single transaction.

```mermaid
sequenceDiagram
    participant U as User
    participant SF as SignupForm
    participant R as Backend /register
    participant DB as PostgreSQL
    participant E as Email Service
    participant SI as /auth/signin

    U->>SF: Fill name, email, password, confirm password
    SF->>SF: Client-side validation (password match, length)
    SF->>R: POST /register {email, password, full_name, org_name?}
    R->>R: validate_password (length, digits)
    R->>DB: Check duplicate email (case-insensitive)
    R->>DB: INSERT User (is_verified=false)
    R->>DB: INSERT Organization (tier="community")
    R->>DB: INSERT Membership (role="owner")
    R->>DB: Create verification token
    R->>DB: COMMIT
    R->>E: Send verification email (async, best-effort)
    R-->>SF: 201 {user_id, org_id}
    SF->>SI: Redirect to /auth/signin?registered=true
    SI-->>U: Show "Account created successfully" banner
```

**Rate limit:** 3 registrations per hour per IP.

| Test Layer          | File                                         | What is verified                                                           |
| ------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| Backend unit        | `tests/api/auth/test_register.py`            | 201 response, DB records, duplicate rejection, password policy, email send |
| Backend unit        | `tests/api/auth/test_email_normalization.py` | Case-insensitive duplicate detection                                       |
| Backend integration | `tests/api/test_new_user_journey.py`         | Register creates user+org+membership                                       |

> **Note:** Backend test references (Python/pytest paths like `tests/api/...`) are in the [`dev-health-ops`](https://github.com/chrisgeo/dev-health-ops) repository, not this repo.
> | Frontend unit | `src/components/auth/SignupForm.test.tsx` | Form rendering, validation, redirect, error handling |
> | Frontend E2E | `tests/auth-signup.spec.ts` | Full form submission, mismatch/short password, duplicate email |
> | Frontend E2E | `tests/account-creation-journey.spec.ts` (step 1) | Signup redirects with banner |
> | Live E2E | `tests/live/onboarding-ui.spec.ts` | Full signup flow against real backend |

#### Email Verification

User clicks the verification link from their inbox. Backend validates the token and marks the user as verified.

```mermaid
sequenceDiagram
    participant U as User
    participant E as Verification Email
    participant V as Backend /verify
    participant DB as PostgreSQL
    participant SI as /auth/signin

    U->>E: Click verification link
    E->>V: GET /verify?token=xxx
    V->>DB: Validate token (not expired)
    V->>DB: SET is_verified=true
    V->>DB: COMMIT
    V-->>U: 200 {verified: true}
```

Resend flow: `POST /resend-verification` creates a new token and resends. Returns a generic message regardless of account existence (anti-enumeration).

| Test Layer   | File                                                    | What is verified                                                  |
| ------------ | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Backend unit | `tests/api/auth/test_email_verification_enforcement.py` | Token validation, user marked verified, resend always returns 200 |

#### Login (Happy Path)

Verified user submits credentials. Backend validates password, resolves org membership, returns tokens.

```mermaid
sequenceDiagram
    participant U as User
    participant LF as LoginForm
    participant NA as NextAuth authorize
    participant L as Backend /login
    participant S as NextAuth session
    participant D as /dashboard
    participant O as /auth/onboard

    U->>LF: Submit email + password
    LF->>NA: signIn("credentials", {redirect: false})
    NA->>L: POST /login {email, password}
    L->>L: check_lockout, bcrypt verify
    L-->>NA: LoginResponse {access_token, refresh_token, needs_onboarding, user}
    NA->>S: Create session/JWT with backend token
    alt needs_onboarding is false
        LF->>D: router.push("/dashboard")
    else needs_onboarding is true
        LF->>O: router.push("/auth/onboard")
    end
```

| Test Layer          | File                                                    | What is verified                           |
| ------------------- | ------------------------------------------------------- | ------------------------------------------ |
| Backend unit        | `tests/api/auth/test_email_normalization.py`            | Case-insensitive lookup                    |
| Backend unit        | `tests/api/auth/test_email_verification_enforcement.py` | Verified user can login                    |
| Backend integration | `tests/api/test_new_user_journey.py`                    | Register then login returns tokens         |
| Frontend unit       | `src/components/auth/LoginForm.test.tsx`                | Dashboard redirect on success              |
| Frontend E2E        | `tests/auth-signin.spec.ts`                             | Form renders, error toast                  |
| Frontend E2E        | `tests/account-creation-journey.spec.ts` (step 2-3)     | Login then onboard then dashboard          |
| Live E2E            | `tests/live/onboarding-ui.spec.ts`                      | Login with verified user reaches dashboard |

#### Login (Unverified Email)

User has valid credentials but has not verified their email.

```mermaid
sequenceDiagram
    participant U as User
    participant LF as LoginForm
    participant NA as NextAuth authorize
    participant L as Backend /login
    participant ERR as EmailVerificationRequired

    U->>LF: Submit credentials
    LF->>NA: signIn("credentials", {redirect: false})
    NA->>L: POST /login
    L-->>NA: 200 {status: "email_verification_required", email, message}
    NA->>ERR: Throw EmailVerificationRequired (code="email_verification_required")
    ERR-->>LF: signIn returns {code: "email_verification_required"}
    LF-->>U: Show amber "Please verify your email" banner
```

The backend returns HTTP 200 (not 401) with `status: "email_verification_required"`. The frontend `EmailVerificationRequired` class extends `CredentialsSignin` with `code = "email_verification_required"`. `LoginForm` checks `result.code` and renders the amber banner instead of an error toast.

| Test Layer    | File                                                    | What is verified                                          |
| ------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| Backend unit  | `tests/api/auth/test_email_verification_enforcement.py` | Unverified local user gets verification required response |
| Backend unit  | `tests/api/auth/test_email_verification_enforcement.py` | OAuth user bypasses verification                          |
| Frontend unit | `src/components/auth/LoginForm.test.tsx`                | Banner shown for verification code                        |

#### Login (Invalid Credentials / Account Lockout)

Password mismatch, nonexistent user, or disabled account. Constant-time comparison using `DUMMY_PASSWORD_HASH` prevents timing attacks.

```mermaid
sequenceDiagram
    participant U as User
    participant LF as LoginForm
    participant NA as NextAuth authorize
    participant L as Backend /login

    U->>LF: Submit credentials
    LF->>NA: signIn("credentials", {redirect: false})
    NA->>L: POST /login
    alt account locked (too many failures)
        L-->>NA: 429 {retry_after_seconds}
    else invalid credentials
        L->>L: record_failed_attempt
        L-->>NA: 401 "Invalid credentials"
    end
    NA-->>LF: signIn returns {error: "CredentialsSignin"}
    LF-->>U: Show "Invalid email or password" toast
```

| Test Layer    | File                                         | What is verified                 |
| ------------- | -------------------------------------------- | -------------------------------- |
| Backend unit  | `tests/api/auth/test_email_normalization.py` | Nonexistent user returns 401     |
| Frontend unit | `src/components/auth/LoginForm.test.tsx`     | Error toast on CredentialsSignin |
| Frontend E2E  | `tests/auth-signin.spec.ts`                  | Error toast on failed login      |

#### Password Reset

Two-step flow: request reset email, then submit new password with token.

```mermaid
flowchart TD
    A[User submits email] -->|POST /forgot-password| B[Backend]
    B --> C{User exists?}
    C -->|No| D[Return generic message]
    C -->|Yes| E[Create reset token + send email]
    E --> D
    D --> F[User clicks email link]
    F -->|POST /reset-password| G{Token valid?}
    G -->|No| H[400 Invalid/expired]
    G -->|Yes| I[Update password hash]
    I --> J[Redirect to /auth/signin]
```

Anti-enumeration: `POST /forgot-password` always returns the same message regardless of whether the account exists.

| Test Layer   | File                                    | What is verified                                                                             |
| ------------ | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| Backend unit | `tests/api/auth/test_password_reset.py` | Token creation, password update, expired token rejection, generic response for unknown email |

**Gap:** No frontend E2E tests for forgot-password or reset-password pages.

### Onboarding

#### Workspace Creation (create_org)

For users without an organization membership. Typically occurs after invite-based registration where the user was not auto-assigned to an org.

```mermaid
sequenceDiagram
    participant U as User
    participant RS as requireSession guard
    participant O as /auth/onboard
    participant OF as OnboardForm
    participant B as Backend /auth/onboard
    participant S as NextAuth session
    participant D as /dashboard

    U->>RS: Access any (app) route
    RS->>RS: Check needs_onboarding
    RS->>O: Redirect to /auth/onboard
    U->>OF: Enter organization name
    OF->>B: POST /auth/onboard {action: "create_org", org_name}
    B->>B: Create Organization + Membership (role=owner)
    B-->>OF: OnboardResponse {tokens, org_id, org_name, role}
    OF->>S: session.update() with new tokens
    S->>D: Redirect to /dashboard
```

| Test Layer    | File                                              | What is verified                                                   |
| ------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| Backend unit  | `tests/test_onboarding.py`                        | Org creation, token return, already-onboarded rejection            |
| Frontend unit | `src/components/auth/OnboardForm.test.tsx`        | Form submission, redirect, error handling                          |
| Frontend E2E  | `tests/auth-onboard.spec.ts`                      | Form renders, creates workspace, blank name fallback               |
| Frontend E2E  | `tests/account-creation-journey.spec.ts` (step 3) | Login -> onboard -> dashboard                                      |
| Live E2E      | `tests/live/journey.spec.ts`                      | POST /onboard with org_name, re-login shows needs_onboarding=false |

#### Join Organization (join_org)

User joins an existing organization via invite code during onboarding.

```mermaid
sequenceDiagram
    participant U as User
    participant OF as OnboardForm
    participant B as Backend /auth/onboard
    participant DB as PostgreSQL

    U->>OF: Enter invite code
    OF->>B: POST /auth/onboard {action: "join_org", invite_code}
    B->>DB: validate_org_invite(invite_code)
    B->>DB: accept_org_invite -> INSERT Membership
    B-->>OF: OnboardResponse {tokens, org_id, org_name, role}
```

| Test Layer   | File                                 | What is verified                       |
| ------------ | ------------------------------------ | -------------------------------------- |
| Backend unit | `tests/test_onboarding.py`           | Authentication required for onboard    |
| Backend unit | `tests/api/auth/test_invite_flow.py` | Invite validation, membership creation |

### Organization Invitations

#### Invite Lifecycle (Create -> Accept)

Admin creates an invite; invited user accepts it to join the organization.

```mermaid
sequenceDiagram
    participant A as Admin
    participant API as Backend /admin/invites
    participant DB as PostgreSQL
    participant E as Email Service
    participant U as Invited User
    participant AI as Backend /accept-invite

    A->>API: POST create invite {email, role}
    API->>DB: INSERT Invite
    API->>E: Send invite email
    API-->>A: 201 Invite created
    U->>AI: POST /accept-invite {token} + Bearer JWT
    AI->>DB: validate_org_invite(token)
    AI->>DB: INSERT Membership
    AI-->>U: AcceptInviteResponse {tokens, org_id, role}
```

| Test Layer   | File                                 | What is verified                                                                                                                     |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Backend unit | `tests/api/auth/test_invite_flow.py` | Admin can create (member cannot), accept creates membership, expired token rejected, duplicate invite rejected, already-member error |

**Gap:** No frontend E2E tests for invite creation or acceptance UI.

### Impersonation

Superuser "Login as User" functionality for debugging and support.

```mermaid
sequenceDiagram
    participant SA as Superuser
    participant API as Backend /admin/impersonate
    participant DB as PostgreSQL
    participant UI as ImpersonationBanner

    SA->>API: POST /admin/impersonate {target_user_id}
    API->>DB: Validate target exists, is not superuser
    API->>DB: Create impersonation session
    API-->>SA: {status: "active", target_user, expires_at}
    SA->>UI: Session shows impersonator context
    UI-->>SA: Amber banner "Viewing as [user]"
    SA->>API: POST /admin/impersonate/stop
    API->>DB: Mark session ended
    API-->>SA: {status: "stopped"}
```

| Test Layer    | File                                              | What is verified                                                                                                                                      |
| ------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend unit  | `tests/api/admin/test_impersonation_endpoints.py` | Start/stop/status lifecycle, target-not-found, superuser-to-superuser blocked, self-impersonation blocked, non-superuser rejected, cache invalidation |
| Frontend unit | `src/lib/__tests__/access-matrix.test.ts`         | RBAC guards under impersonated sessions, tier gating for impersonated org                                                                             |
| Live E2E      | `tests/live/impersonation.spec.ts`                | Full lifecycle: start -> status -> stop, superuser-to-superuser 403, unauthenticated rejection                                                        |

### SSO (SAML / OIDC)

Enterprise SSO authentication via SAML 2.0 or OpenID Connect.

```mermaid
flowchart TD
    U[User] -->|Visit /auth/sso| SP[Select Provider]
    SP -->|SAML| SR[Redirect to IdP]
    SP -->|OIDC| OR[Redirect to Authorization URL]
    SR --> SAR[IdP posts SAML assertion to ACS]
    OR --> OCR[IdP redirects with auth code]
    SAR --> V1[Validate assertion + extract claims]
    OCR --> V2[Exchange code + validate ID token]
    V1 --> S[Create/update user + session]
    V2 --> S
    S --> D[Redirect to /dashboard]
```

| Test Layer   | File                                                    | What is verified                                                                                     |
| ------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Backend unit | `tests/api/services/test_sso.py`                        | SAML assertion validation, OIDC code exchange, state mismatch detection, expired assertion rejection |
| Backend unit | `tests/api/auth/test_sso_module.py`                     | SSO router registration, endpoint presence, tag assignment                                           |
| Backend unit | `tests/api/auth/test_email_verification_enforcement.py` | OAuth users bypass email verification                                                                |

### RBAC & Access Control

Role-based access control enforced at both route layout and API levels.

```mermaid
flowchart TD
    R[Request] --> RS{requireSession}
    RS -->|No session| SI[/auth/signin]
    RS -->|needs_onboarding| OB[/auth/onboard]
    RS -->|Valid session| RR{Route group?}
    RR -->|"(app)"| APP[App pages]
    RR -->|"(app)/admin"| RG{requireRole admin/owner}
    RR -->|"(app)/superadmin"| SU{requireSuperuser}
    RG -->|Denied| DASH[/dashboard]
    RG -->|Allowed| ADMIN[Admin pages]
    SU -->|Denied| DASH
    SU -->|is_superuser=true| SADMIN[Superadmin pages]
```

| Test Layer    | File                                      | What is verified                                                                                                              |
| ------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Frontend unit | `src/lib/__tests__/auth.test.ts`          | Session redirect, onboard redirect, valid session passthrough                                                                 |
| Frontend unit | `src/lib/__tests__/access-matrix.test.ts` | Full RBAC matrix: 6 personas x 3 gates, tier feature gating (community/team/enterprise), superuser bypass, impersonation RBAC |
| Frontend E2E  | `tests/admin.spec.ts`                     | Admin redirect for unauthenticated users                                                                                      |
| Live E2E      | `tests/live/pages.spec.ts`                | Dashboard and work page redirect to signin                                                                                    |

### Admin Portal Setup

After authentication, admin users configure integrations, sync, teams, and identities.

#### Full Account Setup Journey

```mermaid
sequenceDiagram
    participant U as Admin User
    participant INT as /admin/integrations
    participant SYNC as /admin/sync
    participant TEAM as /admin/teams
    participant ID as /admin/identities
    participant B as Backend API

    U->>INT: Configure GitHub integration (token, org, repos)
    INT->>B: POST /admin/credentials
    B-->>INT: 200 Credential stored
    U->>SYNC: Create sync config (provider, targets)
    SYNC->>B: POST /admin/sync-configs
    B-->>SYNC: 201 Config created
    U->>SYNC: Trigger sync
    SYNC->>B: POST /admin/sync-configs/:id/trigger
    B-->>SYNC: 202 Triggered
    U->>TEAM: Create team (team_id, name, repo_patterns)
    TEAM->>B: POST /admin/teams
    B-->>TEAM: 200 Team created
    U->>ID: Create identity mapping (canonical_id, provider_identities)
    ID->>B: POST /admin/identities
    B-->>ID: 200 Identity created
```

| Test Layer          | File                                                 | What is verified                                                                    |
| ------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Backend integration | `tests/api/test_new_user_journey.py`                 | Register -> login -> create credential -> create sync config -> trigger sync        |
| Backend integration | `tests/api/test_new_user_journey.py`                 | Register -> create identity -> create team                                          |
| Backend unit        | `tests/api/admin/test_sync_configs.py`               | CRUD, trigger, job listing                                                          |
| Backend unit        | `tests/api/admin/test_teams.py`                      | CRUD, import, Celery sync trigger                                                   |
| Backend unit        | `tests/api/admin/test_identities.py`                 | CRUD, active/inactive filtering                                                     |
| Backend unit        | `tests/test_admin_credentials.py`                    | CRUD, test connection, inline persist                                               |
| Frontend E2E        | `tests/account-creation-journey.spec.ts` (steps 4-7) | GitHub integration -> sync config -> team -> identity                               |
| Frontend E2E        | `tests/admin-integrations.spec.ts`                   | GitHub/GitLab/Jira/Linear forms, save, test connection                              |
| Frontend E2E        | `tests/admin-sync.spec.ts`                           | Form rendering, provider filtering, target checkboxes                               |
| Frontend E2E        | `tests/admin-teams.spec.ts`                          | Create team, validation, cancel                                                     |
| Frontend E2E        | `tests/admin-identities.spec.ts`                     | Create identity, provider identity rows                                             |
| Frontend unit       | `src/lib/admin/__tests__/server.test.ts`             | Server actions for credentials, users, audit logs, IP allowlist, retention          |
| Live E2E            | `tests/live/journey.spec.ts`                         | Full API journey: register -> login -> credential -> sync config -> trigger -> jobs |

### Unauthenticated Access

Public pages are accessible without authentication. Protected pages redirect to signin.

```mermaid
flowchart TD
    U[Unauthenticated User] -->|"/"| M[Marketing landing page]
    U -->|"/dashboard"| SI1[Redirect -> /auth/signin]
    U -->|"/work"| SI2[Redirect -> /auth/signin]
    U -->|"/admin/*"| SI3[Redirect -> /auth/signin]
    U -->|"/auth/signin"| LF[Login form]
    U -->|"/auth/signup"| SF[Signup form]
    U -->|"/auth/onboard"| SI4[Redirect -> /auth/signin]
```

| Test Layer   | File                         | What is verified                                             |
| ------------ | ---------------------------- | ------------------------------------------------------------ |
| Frontend E2E | `tests/auth-onboard.spec.ts` | Unauthenticated onboard access redirects to signin           |
| Live E2E     | `tests/live/pages.spec.ts`   | Marketing page accessible, dashboard/work redirect to signin |

### Enterprise Features

Enterprise-tier features with tier-based gating.

| Feature             | Backend Tests                                                                      | Frontend Tests                                                             |
| ------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| IP Allowlisting     | `tests/api/admin/test_ip_allowlist.py` - CRUD, CIDR validation, IP check           | `src/lib/admin/__tests__/server.test.ts` - server actions                  |
| Retention Policies  | `tests/api/admin/test_retention.py` - CRUD, execution, resource types              | `src/lib/admin/__tests__/server.test.ts` - server actions                  |
| Audit Logging       | `tests/api/admin/test_impersonation_endpoints.py` - audit entries on impersonation | `src/lib/admin/__tests__/server.test.ts` - list/get/filter                 |
| Tier Feature Gating | `tests/test_community_features.py` - community denies enterprise features          | `src/lib/__tests__/access-matrix.test.ts` - sidebar filtering, UpgradeGate |

### Token Lifecycle

#### Token Refresh

```mermaid
sequenceDiagram
    participant C as Client
    participant R as Backend /refresh
    participant DB as PostgreSQL

    C->>R: POST /refresh {refresh_token}
    R->>R: Validate refresh token JWT
    R->>DB: find_by_hash(jti)
    alt token revoked (reuse detected)
        R->>DB: revoke_family(family_id)
        R-->>C: 401 "Refresh token reuse detected"
    end
    R->>DB: rotate_token(old_jti -> new_jti)
    R-->>C: 200 {access_token, refresh_token, user}
```

Refresh tokens are single-use with family-based reuse detection.

#### Logout

```mermaid
sequenceDiagram
    participant C as Client
    participant L as Backend /logout
    participant DB as PostgreSQL

    C->>L: POST /logout {refresh_token} + Bearer JWT (optional)
    L->>DB: revoke_token(jti)
    L->>DB: emit_audit_log(LOGOUT)
    L-->>C: 200 {message: "Logout successful"}
```

## Test Coverage Summary

### Fully Covered Journeys

| Journey                    | Backend | Frontend Unit | Frontend E2E | Live E2E |
| -------------------------- | ------- | ------------- | ------------ | -------- |
| Registration               | ✅      | ✅            | ✅           | ✅       |
| Email Verification         | ✅      | —             | —            | —        |
| Login (happy path)         | ✅      | ✅            | ✅           | ✅       |
| Login (unverified)         | ✅      | ✅            | —            | —        |
| Login (invalid)            | ✅      | ✅            | ✅           | —        |
| Onboarding (create_org)    | ✅      | ✅            | ✅           | ✅       |
| Admin Setup (full journey) | ✅      | ✅            | ✅           | ✅       |
| RBAC / Access Matrix       | —       | ✅            | ✅           | ✅       |
| Impersonation              | ✅      | ✅            | —            | ✅       |
| SSO (SAML/OIDC)            | ✅      | —             | —            | —        |

### Coverage Gaps

| Journey                   | Missing Coverage                                                    | Priority |
| ------------------------- | ------------------------------------------------------------------- | -------- |
| Password Reset            | No frontend E2E tests for /forgot-password or /reset-password pages | Medium   |
| Email Verification        | No frontend E2E test for clicking verification link                 | Low      |
| Invite Accept             | No frontend E2E tests for invite creation or acceptance UI          | Medium   |
| Session Expiry            | No tests for re-authentication after expired session                | Low      |
| Onboarding (join_org)     | No frontend E2E test for join via invite code                       | Medium   |
| Billing -> Feature Unlock | No integration test for upgrade -> pay -> feature unlocked          | Low      |

## Session Shape

The `session.user` object is extended beyond standard NextAuth fields:

```typescript
{
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    is_superuser: boolean;
    permissions: string[];
    impersonator?: {
      id: string;
      name: string;
    };
  };
  expires: string;
}
```

JWT and session callbacks handle the mapping from backend response to this structure, including support for impersonation.

## Auth Guards

Server-side guards located in `src/lib/auth.ts`:

- `requireSession()`: Redirects to `/auth/signin` if no valid session exists.
- `requireRole(roles: string[])`: Verifies user has one of the required roles OR `is_superuser === true`. Redirects to `/dashboard` on failure.
- `requireSuperuser()`: Strict check for `is_superuser === true`. Redirects to `/dashboard` on failure.

## Proxy Integration

`src/proxy.ts` enforces authentication at the network level for API requests.

- **Enforcement**: Unauthenticated requests to non-`PUBLIC_PATHS` are redirected to `/auth/signin`.
- **Injection**: Automatically injects the `Authorization: Bearer <access_token>` header into outgoing API/GraphQL requests.
- **Next.js 16 Constraint**: `proxy.ts` and `middleware.ts` **cannot coexist**. The proxy handles both routing logic and header injection.

## Route Group Security

Security is enforced via layouts in specific route groups:

| Route Group        | Layout File                           | Guard Applied                     |
| ------------------ | ------------------------------------- | --------------------------------- |
| `(app)`            | `src/app/(app)/layout.tsx`            | `requireSession()`                |
| `(app)/admin`      | `src/app/(app)/admin/layout.tsx`      | `requireRole(["admin", "owner"])` |
| `(app)/superadmin` | `src/app/(app)/superadmin/layout.tsx` | `requireSuperuser()`              |
| `(auth)`           | `src/app/(auth)/layout.tsx`           | Public (No guard)                 |
| `(marketing)`      | `src/app/(marketing)/layout.tsx`      | Public (No guard)                 |

## Impersonation

Support for "Login as User" functionality:

- **Logic**: Handled via JWT/session callbacks that swap the active user context while preserving the original admin's identity in `impersonator`.
- **UI**: The `ImpersonationBanner` component renders at the top of the app when `session.user.impersonator` is present.

## Key Files

| File                                          | Purpose                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/lib/auth.ts`                             | NextAuth configuration and callbacks                                             |
| `src/proxy.ts`                                | Network-level auth enforcement and header injection                              |
| `src/lib/auth.ts` (guards)                    | Server-side redirect logic (`requireSession`, `requireRole`, `requireSuperuser`) |
| `src/components/auth/ImpersonationBanner.tsx` | UI indicator for active impersonation                                            |

## Environment Variables

Auth-related environment variables (see `.env.example` for full list):

| Variable      | Required      | Description                                                                                                                                                                                                                                                               |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET` | Production    | Secret used to sign/encrypt JWTs. Generate with `openssl rand -base64 32`. Auto-generated in dev.                                                                                                                                                                         |
| `AUTH_URL`    | Non-localhost | Full URL where the app is hosted (e.g., `https://app.example.com`). Required for CSRF origin validation in Docker, reverse proxy, or production environments. Without this, sign-in/sign-up fails with a "request origin validation" error. Auto-detected on `localhost`. |
| `BACKEND_URL` | Always        | URL of the dev-health-ops backend API (default: `http://127.0.0.1:8000`).                                                                                                                                                                                                 |

### Troubleshooting: "request origin validation" error

If you see this error during sign-in or sign-up, Auth.js cannot match the request's `Origin` header against the expected URL. This happens when:

1. Running behind a reverse proxy (nginx, Caddy, etc.)
2. Running in Docker with port mapping
3. Deployed to production without `AUTH_URL` set

**Fix:** Set `AUTH_URL` to the publicly accessible URL of the app:

```bash
AUTH_URL=https://app.example.com  # production
AUTH_URL=http://localhost:3000     # local dev (usually auto-detected)
```

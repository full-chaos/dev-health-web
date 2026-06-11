# E2E Spec: Platform Admin Journeys

## Impersonation Lifecycle

Purpose

- Covers superadmin impersonation start/status/stop API lifecycle.
- Documents middleware-based context swap behavior without token issuance.

Primary test files

- `tests/live/impersonation.spec.ts`
- `tests/api/admin/test_impersonation_endpoints.py`

API endpoints

- `POST /api/v1/admin/impersonate` with `{target_user_id}`
- `GET /api/v1/admin/impersonate/status`
- `POST /api/v1/admin/impersonate/stop`

Response contracts

- Start: `{status: "active", target_user: {id, email, org_id, role}, expires_at}`
- Status: `{is_impersonating: bool, target_user_id, expires_at}`
- Stop: `{status: "stopped"}`

Error contracts

- `403` for superuser to superuser impersonation attempt.
- `400` for self-impersonation attempt.
- `401/403` for unauthenticated or unauthorized access.

Security model

- No new token issued.
- Middleware performs context swap.

```mermaid
sequenceDiagram
    autonumber
    participant SA as Superadmin
    participant API as Admin API
    participant MW as Middleware Context
    SA->>API: POST /api/v1/admin/impersonate {target_user_id}
    API-->>SA: {status: active, target_user, expires_at}
    SA->>MW: Continue requests with existing token
    MW-->>SA: Context switched to target user org/role scope
    SA->>API: GET /api/v1/admin/impersonate/status
    API-->>SA: {is_impersonating, target_user_id, expires_at}
    SA->>API: POST /api/v1/admin/impersonate/stop
    API-->>SA: {status: stopped}
```

Test coverage

| Layer         | Coverage | Tests                                             | Notes                                                                           |
| ------------- | -------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Backend Unit  | ✅       | `tests/api/admin/test_impersonation_endpoints.py` | Unit coverage for endpoint contract and restriction rules.                      |
| Frontend Unit | ✅       | `src/lib/__tests__/access-matrix.test.ts`         | Frontend access matrix includes impersonation-aware feature resolution context. |
| Frontend E2E  | —        | —                                                 | No non-live frontend e2e source listed for impersonation UI flow.               |
| Live E2E      | ✅       | `tests/live/impersonation.spec.ts`                | Validates lifecycle behavior in live environment.                               |

## Billing Plan Management

Purpose

- Covers superadmin billing plan CRUD and Stripe product sync process.
- Validates pricing page consumption of billing API plan values.

Primary test files

- `tests/billing-plans.spec.ts`
- `tests/test_billing_plans.py`

Route

- `/superadmin/billing/plans`

Core lifecycle actions

- Create plan with fields: name, key, tier, display order, description, pricing intervals JSON.
- Confirm card appears.
- Edit plan and save changes.
- Trigger `Sync Stripe`.
- Confirm `prod_` identifier appears.
- Archive plan.
- Confirm `Status: inactive`.

Downstream dependency

- `/pricing` reflects billing API plan values dynamically.

```mermaid
sequenceDiagram
    autonumber
    participant SA as Superadmin
    participant UI as Billing Plans UI
    participant API as Billing API
    participant ST as Stripe Sync
    participant PR as Pricing UI
    SA->>UI: Open /superadmin/billing/plans
    UI-->>SA: Show existing plan cards
    SA->>UI: Create plan (name/key/tier/display order/description/pricing intervals JSON)
    UI->>API: Persist plan
    API-->>UI: Plan created
    UI-->>SA: New plan card appears
    SA->>UI: Edit plan and save changes
    UI->>API: Update plan
    API-->>UI: Plan updated
    SA->>UI: Click Sync Stripe
    UI->>ST: Sync product
    ST-->>UI: prod_ identifier returned
    UI-->>SA: Show prod_ ID
    SA->>UI: Archive plan
    UI-->>SA: Show Status: inactive
    SA->>PR: Open /pricing
    PR->>API: Load dynamic prices
    API-->>PR: Return current plan pricing
```

Test coverage

| Layer         | Coverage | Tests                         | Notes                                                            |
| ------------- | -------- | ----------------------------- | ---------------------------------------------------------------- |
| Backend Unit  | ✅       | `tests/test_billing_plans.py` | Covers plan model and API behavior including sync-related logic. |
| Frontend Unit | —        | —                             | No dedicated billing plans unit test file listed.                |
| Frontend E2E  | ✅       | `tests/billing-plans.spec.ts` | Covers superadmin plan CRUD/sync/archive journey.                |
| Live E2E      | —        | —                             | No live e2e source listed for billing plans route.               |

## Subscription Management

Purpose

- Covers billing section subscription visibility and plan change modal behavior.
- Documents webhook-driven subscription state updates.

Primary test files

- `tests/billing-subscriptions.spec.ts`
- `tests/test_subscriptions.py`

Route

- `/admin/settings` (Billing section)

Expected billing section elements

- `Current Plan`
- `Subscription History`
- `Change Plan` button

Change Plan modal behavior

- Uses plan picker cards.
- Does not use raw price ID input.
- `Confirm Change` remains disabled until a plan is selected.

Backend event model

- Webhook-driven state changes via:
    - `customer.subscription.created`
    - `customer.subscription.updated`

```mermaid
sequenceDiagram
    autonumber
    participant U as Admin User
    participant S as Settings Billing UI
    participant M as Change Plan Modal
    participant API as Billing Backend
    participant WH as Stripe Webhook
    U->>S: Open /admin/settings
    S-->>U: Show Current Plan and Subscription History
    U->>S: Click Change Plan
    S-->>M: Open plan picker modal
    M-->>U: Confirm Change disabled
    U->>M: Select plan card
    M-->>U: Confirm Change enabled
    U->>M: Confirm Change
    M->>API: Submit plan change request
    WH->>API: customer.subscription.updated
    API-->>S: Subscription state refreshed
```

Test coverage

| Layer         | Coverage | Tests                                 | Notes                                                           |
| ------------- | -------- | ------------------------------------- | --------------------------------------------------------------- |
| Backend Unit  | ✅       | `tests/test_subscriptions.py`         | Covers subscription state transitions and webhook effects.      |
| Frontend Unit | —        | —                                     | No dedicated unit test file listed for subscription modal path. |
| Frontend E2E  | ✅       | `tests/billing-subscriptions.spec.ts` | Covers billing section and change-plan modal interactions.      |
| Live E2E      | —        | —                                     | No live e2e source listed for subscription management.          |

## Invoice Management

Purpose

- Covers invoice list, details modal, and void flow lifecycle.
- Confirms status transition from active to void after confirmation.

Primary test file

- `tests/billing-invoices.spec.ts`

Route

- `/superadmin/billing/invoices`

Expected list details

- Invoice ID visible.
- Amount visible (example `$120.00`).

View flow

- Click `View`.
- `Invoice Details` modal opens.
- Displays `Team plan`.
- Close returns to list context.

Void flow

- Click `Void`.
- `Void Invoice` modal opens.
- Confirm via `Confirm Void`.
- `Invoice voided` toast appears.
- Row status updates to `void`.

```mermaid
sequenceDiagram
    autonumber
    participant SA as Superadmin
    participant I as Invoice UI
    participant VM as View Modal
    participant XM as Void Modal
    SA->>I: Open /superadmin/billing/invoices
    I-->>SA: Show invoice list with ID and amount
    SA->>I: Click View
    I-->>VM: Open Invoice Details modal
    VM-->>SA: Show Team plan
    SA->>VM: Click Close
    VM-->>I: Return to list
    SA->>I: Click Void
    I-->>XM: Open Void Invoice modal
    SA->>XM: Click Confirm Void
    XM-->>I: Show Invoice voided toast
    I-->>SA: Status updates to void
```

Test coverage

| Layer         | Coverage | Tests                            | Notes                                                             |
| ------------- | -------- | -------------------------------- | ----------------------------------------------------------------- |
| Backend Unit  | —        | —                                | No backend unit invoice CRUD test listed in provided source set.  |
| Frontend Unit | —        | —                                | No frontend invoice unit test file listed in provided source set. |
| Frontend E2E  | ✅       | `tests/billing-invoices.spec.ts` | Covers listing, details modal, and void lifecycle.                |
| Live E2E      | —        | —                                | No live e2e source listed for invoice management route.           |

## Refund Validation

Purpose

- Covers refund initiation validation and backend refund constraints.
- Confirms partial refund validation against refundable balance.

Primary test files

- `tests/billing-refunds.spec.ts`
- `tests/test_refunds.py`

Route

- `/billing-refunds-test`

UI flow

- Click `Issue Refund`.
- Check `Partial refund`.
- Enter amount.
- Click `Continue`.
- Validation message appears: `Amount cannot exceed the refundable balance.`

Backend constraints

- Invoice must be paid.
- Refund amount must be `<= refundable balance`.
- Webhook `charge.refund.updated` drives status transitions.

```mermaid
sequenceDiagram
    autonumber
    participant U as Admin User
    participant R as Refund UI
    participant API as Refund Backend
    participant WH as Webhook Handler
    U->>R: Open /billing-refunds-test
    U->>R: Click Issue Refund
    U->>R: Enable Partial refund
    U->>R: Enter amount
    U->>R: Click Continue
    R->>API: Validate refund request
    API-->>R: Reject when amount > refundable balance
    R-->>U: Show Amount cannot exceed the refundable balance.
    WH->>API: charge.refund.updated
    API-->>R: Update refund status lifecycle
```

Test coverage

| Layer         | Coverage | Tests                           | Notes                                                         |
| ------------- | -------- | ------------------------------- | ------------------------------------------------------------- |
| Backend Unit  | ✅       | `tests/test_refunds.py`         | Covers paid-invoice constraint and refundable amount bounds.  |
| Frontend Unit | —        | —                               | No frontend refund unit test file listed in provided sources. |
| Frontend E2E  | ✅       | `tests/billing-refunds.spec.ts` | Covers UI validation path for partial refund flow.            |
| Live E2E      | —        | —                               | No live e2e source listed for refund validation route.        |

## Billing Audit

Purpose

- Covers billing audit console route and unauthenticated fallback behavior.
- Documents reconciliation control surface on superadmin page.

Primary test file

- `tests/billing-audit.spec.ts`

Route

- `/superadmin/billing/audit`

Expected controls

- `Billing Audit` heading.
- `Run Reconciliation` button.
- `Apply` button.

Auth fallback behavior

- Unauthenticated requests redirect to signin route.

```mermaid
flowchart TD
    U[User opens /superadmin/billing/audit] --> A{Authenticated}
    A -- Yes --> B[Render Billing Audit heading]
    B --> C[Render Run Reconciliation button]
    B --> D[Render Apply button]
    A -- No --> R[Redirect to signin]
```

Test coverage

| Layer         | Coverage | Tests                         | Notes                                                               |
| ------------- | -------- | ----------------------------- | ------------------------------------------------------------------- |
| Backend Unit  | —        | —                             | No backend unit source listed for billing audit endpoints or logic. |
| Frontend Unit | —        | —                             | No frontend unit source listed for billing audit page.              |
| Frontend E2E  | ✅       | `tests/billing-audit.spec.ts` | Covers route content and unauthenticated fallback behavior.         |
| Live E2E      | —        | —                             | No live e2e source listed for billing audit journey.                |

## IP Allowlisting

Purpose

- Covers admin IP allowlist CRUD and allow check endpoint behavior.
- Documents validation and default-open behavior for empty allowlist.

Primary test files

- `tests/api/admin/test_ip_allowlist.py`
- `src/lib/admin/__tests__/server.test.ts`

API scope

- CRUD operations on `/api/v1/admin/ip-allowlist`.
- Check endpoint confirms allow decision.

Validation rules

- CIDR notation is required.
- Empty allowlist means all IPs are allowed.
- Check response includes `allowed: true/false`.

Frontend integration source

- Server action coverage in `src/lib/admin/__tests__/server.test.ts`.

```mermaid
flowchart TD
    A[Admin submits allowlist entry] --> V{Valid CIDR}
    V -- No --> E[Reject validation]
    V -- Yes --> C[Persist via /api/v1/admin/ip-allowlist]
    C --> Q[Run allow check endpoint]
    Q --> L{Allowlist empty}
    L -- Yes --> T1[Return allowed: true]
    L -- No --> M{IP in permitted CIDR}
    M -- Yes --> T2[Return allowed: true]
    M -- No --> T3[Return allowed: false]
```

Test coverage

| Layer         | Coverage | Tests                                    | Notes                                                       |
| ------------- | -------- | ---------------------------------------- | ----------------------------------------------------------- |
| Backend Unit  | ✅       | `tests/api/admin/test_ip_allowlist.py`   | Covers CRUD, CIDR validation, and check endpoint semantics. |
| Frontend Unit | ✅       | `src/lib/admin/__tests__/server.test.ts` | Covers server action integration points for admin controls. |
| Frontend E2E  | —        | —                                        | No frontend e2e source listed for allowlist UI workflow.    |
| Live E2E      | —        | —                                        | No live e2e source listed for IP allowlisting.              |

## Retention Policies

Purpose

- Covers retention policy CRUD and execution endpoint behavior.
- Documents duplicate resource-type rejection rule.

Primary test files

- `tests/api/admin/test_retention.py`
- `src/lib/admin/__tests__/server.test.ts`

API scope

- CRUD operations on `/api/v1/admin/retention-policies`.
- Payload shape includes `{resource_type, retention_days}`.
- Execution endpoint triggers retention action.

Validation rules

- Duplicate `resource_type` returns `400`.

Frontend integration source

- Server action coverage in `src/lib/admin/__tests__/server.test.ts`.

```mermaid
flowchart TD
    A[Admin creates retention policy] --> P[POST /api/v1/admin/retention-policies]
    P --> D{resource_type duplicate}
    D -- Yes --> E[Return 400]
    D -- No --> S[Persist policy]
    S --> U[Update or list policies]
    U --> X[Run execution endpoint]
    X --> R[Retention run completes]
```

Test coverage

| Layer         | Coverage | Tests                                    | Notes                                                             |
| ------------- | -------- | ---------------------------------------- | ----------------------------------------------------------------- |
| Backend Unit  | ✅       | `tests/api/admin/test_retention.py`      | Covers CRUD behavior, duplicate constraints, and execution path.  |
| Frontend Unit | ✅       | `src/lib/admin/__tests__/server.test.ts` | Covers server action integration for retention policy operations. |
| Frontend E2E  | —        | —                                        | No frontend e2e source listed for retention policy UI flow.       |
| Live E2E      | —        | —                                        | No live e2e source listed for retention policy management.        |

## Platform Stats

Purpose

- Covers platform-level aggregate stats endpoint for admin observability.
- Documents expected count categories and health metrics returned.

Primary test file

- `tests/test_platform_stats.py`

API endpoint

- `GET /api/v1/admin/platform/stats`

Returned domains

- Organization counts.
- User counts: total, active, superuser.
- Sync configuration counts.
- Tier distribution.
- Sync health counts: success and failed.

```mermaid
sequenceDiagram
    autonumber
    participant SA as Superadmin
    participant API as Platform Stats API
    participant DB as Metrics/Data Stores
    SA->>API: GET /api/v1/admin/platform/stats
    API->>DB: Query org/user/sync/tier/health aggregates
    DB-->>API: Aggregate counts
    API-->>SA: Return stats payload
```

Test coverage

| Layer         | Coverage | Tests                          | Notes                                                     |
| ------------- | -------- | ------------------------------ | --------------------------------------------------------- |
| Backend Unit  | ✅       | `tests/test_platform_stats.py` | Covers endpoint payload structure and aggregate values.   |
| Frontend Unit | —        | —                              | No frontend stats consumer test listed.                   |
| Frontend E2E  | —        | —                              | No frontend e2e source listed for platform stats display. |
| Live E2E      | —        | —                              | No live e2e source listed for this endpoint flow.         |

## Tier Feature Gating

Purpose

- Covers tier-based access control at backend decorator and frontend gating layers.
- Documents impersonation interaction with target organization tier visibility.

Primary test files

- `tests/test_community_features.py`
- `src/lib/__tests__/access-matrix.test.ts`

Tier model

- `community`
- `team`
- `enterprise`

Backend enforcement

- `@require_feature` decorator checks `Organization.tier`.
- Community tier receives `403` on enterprise-only features.

Frontend enforcement

- `UpgradeGate` component controls gated content.
- `AdminSidebar` filters items by `featureKey`.

Impersonation behavior

- Superuser sees feature availability resolved using target organization tier.

```mermaid
flowchart TD
    U[User requests feature] --> B[@require_feature checks Organization.tier]
    B --> T{Tier supports feature}
    T -- Yes --> OK[Allow backend action]
    T -- No --> F403[Return 403]
    OK --> FE[Frontend route loads]
    FE --> G[UpgradeGate evaluates feature]
    G --> S[AdminSidebar filters by featureKey]
    S --> V[Render only allowed items]
    I[If impersonating] --> TI[Resolve tier from target org]
    TI --> G
```

Test coverage

| Layer         | Coverage | Tests                                     | Notes                                                              |
| ------------- | -------- | ----------------------------------------- | ------------------------------------------------------------------ |
| Backend Unit  | ✅       | `tests/test_community_features.py`        | Covers backend decorator behavior across tiers.                    |
| Frontend Unit | ✅       | `src/lib/__tests__/access-matrix.test.ts` | Covers frontend access matrix and gating semantics.                |
| Frontend E2E  | —        | —                                         | No frontend e2e source listed for tier gating navigation behavior. |
| Live E2E      | —        | —                                         | No live e2e source listed for tier gating.                         |

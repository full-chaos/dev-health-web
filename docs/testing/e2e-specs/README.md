# E2E Test Journey Specs

> **These are test-coverage specifications, not end-user guides.** Each page below
> maps a platform flow to the Playwright / unit test files that exercise it (routes,
> actors, response contracts, coverage matrix). If you are looking for a narrative,
> first-time walkthrough of the product UI, see the end-user
> [User Journeys](../../user-journeys/README.md) instead.
>
> Comprehensive documentation of all user-facing flows across the Full Chaos Dev Health platform.
> For authentication journeys (registration, login, verification, SSO, RBAC), see [auth-system.md](../../auth-system.md).

## Table of Contents

### [Onboarding Journeys](onboarding.md)

- [Guided First-Run Onboarding (CHAOS-2670)](onboarding.md#guided-first-run-onboarding-chaos-2670)
- [Full Account Setup (7-Step Journey)](onboarding.md#full-account-setup-7-step-journey)
- [Workspace Creation](onboarding.md#workspace-creation)
- [Organization Invite Lifecycle](onboarding.md#organization-invite-lifecycle)

### [Account Admin Journeys](account-admin.md)

- [Integration Setup](account-admin.md#integration-setup)
- [Sync Configuration](account-admin.md#sync-configuration)
- [Sync Observability](account-admin.md#sync-observability)
- [Team Management](account-admin.md#team-management)
- [Identity Mapping](account-admin.md#identity-mapping)
- [Organization Settings](account-admin.md#organization-settings)

### [Account User Journeys](account-user.md)

- [Dashboard Landing & Drill-down](account-user.md#dashboard-landing--drill-down)
- [Work Tabbed Navigation](account-user.md#work-tabbed-navigation)
- [Filter Propagation](account-user.md#filter-propagation)
- [People Search & Individual Views](account-user.md#people-search--individual-views)
- [Chart Interactions](account-user.md#chart-interactions)
- [Deployment Flame View](account-user.md#deployment-flame-view)
- [Marketing & Pricing Pages](account-user.md#marketing--pricing-pages)

### [Platform Admin Journeys](platform-admin.md)

- [Impersonation Lifecycle](platform-admin.md#impersonation-lifecycle)
- [Billing Plan Management](platform-admin.md#billing-plan-management)
- [Subscription Management](platform-admin.md#subscription-management)
- [Invoice Management](platform-admin.md#invoice-management)
- [Refund Validation](platform-admin.md#refund-validation)
- [Billing Audit](platform-admin.md#billing-audit)
- [IP Allowlisting](platform-admin.md#ip-allowlisting)
- [Retention Policies](platform-admin.md#retention-policies)
- [Platform Stats](platform-admin.md#platform-stats)
- [Tier Feature Gating](platform-admin.md#tier-feature-gating)

---

## Test Coverage Summary

### Master Coverage Matrix

| Journey                     | Backend Unit                           | Frontend Unit                                             | Frontend E2E                                                       | Live E2E                                        |
| --------------------------- | -------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| Guided First-Run Onboarding | —                                      | —                                                         | ✅ (`auth-onboard.spec.ts`)                                        | ✅ (`onboarding-ui.spec.ts`, `journey.spec.ts`) |
| Full Account Setup          | —                                      | —                                                         | ✅                                                                 | ✅                                              |
| Integration Setup           | ✅ (`test_admin_credentials.py`)       | ✅ (`IntegrationForm.test.tsx`)                           | ✅ (`admin-integrations.spec.ts`, account-creation-journey step 4) | ✅ (`journey.spec.ts`)                          |
| Sync Configuration          | ✅ (`test_sync_configs.py`)            | ✅ (`SyncConfigForm.test.tsx`)                            | ✅ (`admin-sync.spec.ts`, account-creation-journey step 5)         | ✅ (`journey.spec.ts`)                          |
| Sync Observability          | —                                      | ✅ (`BackfillWizard.test.tsx`, `SyncJobHistory.test.tsx`) | ✅ (`admin-sync-observability.spec.ts`)                            | —                                               |
| Team Management             | ✅ (`test_teams.py`)                   | ✅ (`TeamForm.test.tsx`)                                  | ✅ (`admin-teams.spec.ts`, account-creation-journey step 6)        | —                                               |
| Identity Mapping            | ✅ (`test_identities.py`)              | ✅ (`IdentityForm.test.tsx`)                              | ✅ (`admin-identities.spec.ts`, account-creation-journey step 7)   | —                                               |
| Organization Settings       | —                                      | —                                                         | ✅ (`admin-settings.spec.ts`)                                      | —                                               |
| Dashboard & Drill-down      | —                                      | —                                                         | ✅ (`home-flow.spec.ts`)                                           | —                                               |
| Work Navigation             | —                                      | —                                                         | ✅ (`work-navigation.spec.ts`)                                     | —                                               |
| Filter Propagation          | —                                      | —                                                         | ✅ (`filter-propagation.spec.ts`)                                  | —                                               |
| People Search               | —                                      | —                                                         | ✅ (`people.spec.ts`)                                              | —                                               |
| Chart Rendering             | —                                      | —                                                         | ✅ (`sankey/quadrant/heatmap/flame.spec.ts`)                       | —                                               |
| Deployment Flame            | —                                      | —                                                         | ✅ (`deployments.spec.ts`)                                         | —                                               |
| Marketing/Pricing           | —                                      | —                                                         | ✅ (`marketing-pricing.spec.ts`)                                   | —                                               |
| Impersonation               | ✅ (`test_impersonation_endpoints.py`) | ✅ (`access-matrix.test.ts`)                              | —                                                                  | ✅ (`impersonation.spec.ts`)                    |
| Billing Plans               | ✅ (`test_billing_plans.py`)           | —                                                         | ✅ (`billing-plans.spec.ts`)                                       | —                                               |
| Subscriptions               | ✅ (`test_subscriptions.py`)           | —                                                         | ✅ (`billing-subscriptions.spec.ts`)                               | —                                               |
| Invoices                    | —                                      | —                                                         | ✅ (`billing-invoices.spec.ts`)                                    | —                                               |
| Refunds                     | ✅ (`test_refunds.py`)                 | —                                                         | ✅ (`billing-refunds.spec.ts`)                                     | —                                               |
| Billing Audit               | —                                      | —                                                         | ✅ (`billing-audit.spec.ts`)                                       | —                                               |
| IP Allowlisting             | ✅ (`test_ip_allowlist.py`)            | ✅ (`server.test.ts`)                                     | —                                                                  | —                                               |
| Retention Policies          | ✅ (`test_retention.py`)               | ✅ (`server.test.ts`)                                     | —                                                                  | —                                               |
| Platform Stats              | ✅ (`test_platform_stats.py`)          | —                                                         | —                                                                  | —                                               |
| Tier Feature Gating         | ✅ (`test_community_features.py`)      | ✅ (`access-matrix.test.ts`)                              | —                                                                  | —                                               |

### Coverage Gaps

| Journey                | Missing Coverage                          | Priority |
| ---------------------- | ----------------------------------------- | -------- |
| Organization Settings  | No backend unit tests for settings CRUD   | Medium   |
| Dashboard & Drill-down | No backend or unit tests                  | Low      |
| Work Navigation        | No backend or unit tests                  | Low      |
| Filter Propagation     | No backend or unit tests (URL-only logic) | Low      |
| People Search          | No backend unit tests for search endpoint | Medium   |
| Chart Rendering        | No unit tests for chart components        | Medium   |
| Deployment Flame       | No backend unit tests for deployment data | Medium   |
| Marketing/Pricing      | No backend tests for pricing page data    | Low      |
| Invoices               | No backend unit tests for invoice CRUD    | Medium   |
| Billing Audit          | No backend or unit tests                  | Medium   |
| IP Allowlisting        | No frontend E2E tests                     | Low      |
| Retention Policies     | No frontend E2E tests                     | Low      |
| Platform Stats         | No frontend tests at all                  | Medium   |
| Tier Feature Gating    | No frontend E2E tests                     | Low      |

# E2E Spec: Account User Journeys

## Dashboard Landing & Drill-down

Purpose

- Covers dashboard entry, tile drill-down, evidence panel, and explore deep-linking.
- Verifies filter parameter continuity into explore route.

Primary test file

- `tests/home-flow.spec.ts`

Routes

- `/` with heading `Home`
- `/explore?metric=...&f=...`
- `/opportunities` with heading `Focus Cards`

Core interaction chain

- Open dashboard.
- Click delta tile.
- Evidence panel opens.
- Click `Open evidence ↗`.
- Navigate to explore route with `metric` and preserved `f`.

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant D as Dashboard UI
    participant EP as Evidence Panel
    participant EX as Explore UI
    participant OP as Opportunities UI
    U->>D: Open /
    D-->>U: Show Home
    U->>D: Click delta tile
    D->>EP: Open evidence panel
    EP-->>U: Show evidence details
    U->>EP: Click Open evidence ↗
    EP-->>EX: Navigate /explore?metric=...&f=...
    EX-->>U: Render explore view with preserved filter f
    U->>OP: Open /opportunities
    OP-->>U: Show Focus Cards
```

Test coverage

| Layer         | Coverage | Tests                     | Notes                                                        |
| ------------- | -------- | ------------------------- | ------------------------------------------------------------ |
| Backend Unit  | —        | —                         | No backend unit source listed for dashboard drill-down flow. |
| Frontend Unit | —        | —                         | No component unit source listed for this journey.            |
| Frontend E2E  | ✅       | `tests/home-flow.spec.ts` | Route and deep-link continuity are covered end-to-end.       |
| Live E2E      | —        | —                         | No live e2e source listed for this journey.                  |

## Diagnose Navigation and Legacy Work Links

Purpose

- Covers the Diagnose destinations in the sidebar and the redirects of the legacy `/work` route.
- Verifies that the filter parameter `f` is kept across the redirect.

Primary test file

- `tests/work-navigation.spec.ts`

Route contract

- `/diagnose` renders the area overview. The sidebar lists the Diagnose destinations (Flow, Investment, Landscape, Work Graph, Complexity, Cognitive Load, Bottlenecks).
- `/work?tab=<tab>` redirects (HTTP 307) to the destination of the tab and forwards `f` and other query values:

| `tab`        | Destination                          |
| ------------ | ------------------------------------ |
| `overview`   | `/diagnose`                          |
| `flow`       | `/metrics?tab=flow`                  |
| `investment` | `/investment`                        |
| `landscape`  | `/landscape`                         |
| `capacity`   | `/plan/capacity`                     |
| `heatmap`    | `/cognitive-load?tab=heatmap`        |
| `flame`      | `/complexity?tab=flame`              |
| `graph`      | `/diagnose/work-graph`               |
| `evidence`   | `/diagnose/work-graph?evidence=open` |

- `/work?view=work` redirects to `/diagnose/work-graph`. `/work` with no value redirects to `/diagnose`.

Test coverage

| Layer        | Coverage | Tests                           | Notes                                             |
| ------------ | -------- | ------------------------------- | ------------------------------------------------- |
| Frontend E2E | ✅       | `tests/work-navigation.spec.ts` | Diagnose children, legacy redirects, filter kept. |

## Filter Propagation

Purpose

- Covers cross-route filter continuity through shared navigation.
- Validates that encoded filter query parameter is identical after navigation.

Primary test file

- `tests/filter-propagation.spec.ts`

Primary routes in scope

- `/dashboard`
- `/people`
- `/metrics`
- `/landscape`
- `/diagnose`
- `/code`
- `/opportunities`

Additional route in scope

- `/metrics?tab=dora`

Flow behavior

- Open `Filters` panel.
- Expand `Who`.
- Fill developer filter.
- Collapse filter group.
- Navigate via `aside nav`.
- Confirm `f` query parameter is identical on destination routes.

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FP as Filters Panel
    participant NAV as Aside Nav
    participant R as Route Layer
    U->>R: Open /dashboard
    U->>FP: Click Filters
    U->>FP: Expand Who
    U->>FP: Enter developer filter
    U->>FP: Collapse Who
    U->>NAV: Navigate to /people, /metrics, /landscape, /diagnose, /code, /opportunities
    NAV->>R: Route changes with query
    R-->>U: Preserve identical f param on each route
    U->>R: Open /metrics?tab=dora
    U->>FP: Change filter
    U->>NAV: Navigate to /diagnose
    R-->>U: Updated f preserved
```

Test coverage

| Layer         | Coverage | Tests                              | Notes                                                               |
| ------------- | -------- | ---------------------------------- | ------------------------------------------------------------------- |
| Backend Unit  | —        | —                                  | No backend unit source listed for URL-only propagation behavior.    |
| Frontend Unit | —        | —                                  | No dedicated unit coverage listed for global filter shell behavior. |
| Frontend E2E  | ✅       | `tests/filter-propagation.spec.ts` | Source of truth for end-to-end URL preservation behavior.           |
| Live E2E      | —        | —                                  | No live e2e source listed for filter propagation journey.           |

## People Search & Individual Views

Purpose

- Covers people search, person detail route, metric drill-in, and evidence listing.
- Enforces language guardrail against comparative performance framing.

Primary test file

- `tests/people.spec.ts`

Route sequence

- `/people?q=alex`
- `/people/person-123`
- `/people/person-123/metrics/cycle_time`

Interaction chain

- Search by query parameter.
- Open person profile.
- Verify `Individual view` context.
- Open `Cycle Time` metric detail.
- Open `PRs` evidence section with heading and table.

Guardrail terms excluded

- `rank`
- `percentile`
- `top performer`
- `bottom performer`
- `score`

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant PS as People Search UI
    participant PV as Person View UI
    participant MV as Metric View UI
    participant EV as Evidence View UI
    U->>PS: Open /people?q=alex
    PS-->>U: Show matching people list
    U->>PS: Click Alex Harper
    PS-->>PV: Navigate /people/person-123
    PV-->>U: Show Individual view
    U->>PV: Click Cycle Time
    PV-->>MV: Navigate /people/person-123/metrics/cycle_time
    U->>MV: Click PRs
    MV-->>EV: Show evidence section
    EV-->>U: Render Evidence heading and table
```

Test coverage

| Layer         | Coverage | Tests                  | Notes                                                              |
| ------------- | -------- | ---------------------- | ------------------------------------------------------------------ |
| Backend Unit  | —        | —                      | No backend unit source listed for people search endpoint behavior. |
| Frontend Unit | —        | —                      | No people-page unit test file listed in provided data.             |
| Frontend E2E  | ✅       | `tests/people.spec.ts` | Covers search, drill-down, and guardrail assertions.               |
| Live E2E      | —        | —                      | No live e2e source listed for people journey.                      |

## Chart Interactions

Purpose

- Covers rendering readiness and interaction surfaces for chart families.
- Includes sankey, quadrant, heatmap, and flame chart behavior on demo route.

Primary test files

- `tests/sankey.spec.ts`
- `tests/quadrant.spec.ts`
- `tests/heatmap.spec.ts`
- `tests/flame.spec.ts`

Shared route

- `/demo`

Rendering readiness signals

- Chart canvas exists.
- `data-chart-ready="true"` is present.

Chart-specific behaviors

- Sankey investigation path starts from quadrant panel.
- `Core` button appears in investigation context.
- `View Flow` deep-links into `/work?tab=flow`.
- Flame mode selector supports:
    - `Elapsed Time Breakdown`
    - `Throughput Breakdown`
    - `Code Hotspots`
- Flame mode changes update `mode=` query parameter.

```mermaid
flowchart TD
    U[User opens /demo] --> R[Chart shell renders]
    R --> C{Canvas and data-chart-ready=true}
    C -- Yes --> Q[Quadrant interactions enabled]
    Q --> CORE[Click Core button]
    CORE --> VF[Click View Flow]
    VF --> W[/work?tab=flow]
    C -- Yes --> FL[Flame interactions enabled]
    FL --> M{Select mode}
    M -- Elapsed Time Breakdown --> U1[URL mode=elapsed]
    M -- Throughput Breakdown --> U2[URL mode=throughput]
    M -- Code Hotspots --> U3[URL mode=hotspots]
```

Test coverage

| Layer         | Coverage | Tests                                                                                            | Notes                                                                  |
| ------------- | -------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Backend Unit  | —        | —                                                                                                | No backend unit source listed for client chart rendering interactions. |
| Frontend Unit | —        | —                                                                                                | No chart component unit tests listed in provided data set.             |
| Frontend E2E  | ✅       | `tests/sankey.spec.ts`, `tests/quadrant.spec.ts`, `tests/heatmap.spec.ts`, `tests/flame.spec.ts` | Multi-spec e2e coverage for rendering and interaction flows.           |
| Live E2E      | —        | —                                                                                                | No live e2e chart interaction source listed.                           |

## Deployment Flame View

Purpose

- Covers deployment-specific flame visualization route and fallback state.
- Confirms metadata and back-navigation rendering.

Primary test file

- `tests/deployments.spec.ts`

Route in scope

- `/deployments/deploy-123`

Expected elements

- `Flame Diagram` heading.
- Deployment ID.
- `staging` environment label.
- `Back to Explore` link.

Fallback route

- `/deployments/missing-flame`
- Displays `Flame data unavailable for this deployment.`

```mermaid
flowchart TD
    U[User opens deployment route] --> R{Deployment flame data exists}
    R -- Yes --> V[Render Flame Diagram view]
    V --> D1[Show deployment ID]
    V --> D2[Show staging environment]
    V --> D3[Show Back to Explore link]
    R -- No --> F[Render fallback message]
    F --> M[Flame data unavailable for this deployment.]
```

Test coverage

| Layer         | Coverage | Tests                       | Notes                                                                  |
| ------------- | -------- | --------------------------- | ---------------------------------------------------------------------- |
| Backend Unit  | —        | —                           | No backend unit source listed for deployment flame payload generation. |
| Frontend Unit | —        | —                           | No deployment flame component unit source listed.                      |
| Frontend E2E  | ✅       | `tests/deployments.spec.ts` | Covers happy path and fallback rendering states.                       |
| Live E2E      | —        | —                           | No live e2e source listed for deployment flame route.                  |

## Marketing & Pricing Pages

Purpose

- Covers marketing landing route and pricing route with dynamic billing-backed prices.
- Documents core content blocks and CTA navigation behavior.

Primary test file

- `tests/marketing-pricing.spec.ts`

Routes

- `/`
- `/pricing`

Marketing page expectations

- Hero text includes `What is your engineering data`.
- Feature areas include Signals, Investment, Flow, DORA, Quadrant, Developer Health.
- Persona sections include IC, EM, PM, Leadership.
- Navigation includes pricing link.

Pricing page expectations

- Heading `Simple, transparent pricing`.
- Three tiers:
    - Community = Free
    - Team = $49
    - Enterprise = $129
- Dynamic prices sourced from billing API.
- Comparison table present.
- CTA buttons navigate to `/auth/signup`.
- `Talk to sales` link present.

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant M as Marketing UI
    participant P as Pricing UI
    participant B as Billing API
    U->>M: Open /
    M-->>U: Render hero, features, personas, pricing nav link
    U->>M: Click Pricing
    M-->>P: Navigate /pricing
    P->>B: Fetch dynamic plan prices
    B-->>P: Return plan pricing data
    P-->>U: Render Community/Team/Enterprise cards and comparison table
    U->>P: Click signup CTA
    P-->>U: Navigate /auth/signup
    U->>P: Click Talk to sales link
    P-->>U: Open sales contact path
```

Test coverage

| Layer         | Coverage | Tests                             | Notes                                                             |
| ------------- | -------- | --------------------------------- | ----------------------------------------------------------------- |
| Backend Unit  | —        | —                                 | No backend pricing-page data test listed in provided source set.  |
| Frontend Unit | —        | —                                 | No marketing/pricing unit test source listed.                     |
| Frontend E2E  | ✅       | `tests/marketing-pricing.spec.ts` | Verifies key content blocks and pricing behavior in browser flow. |
| Live E2E      | —        | —                                 | No live e2e source listed for marketing/pricing pages.            |

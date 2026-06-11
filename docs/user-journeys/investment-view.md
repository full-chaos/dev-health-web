# User Journey: Reading the Investment View

A narrative, first-time walkthrough of the **Investment View** in the product UI — from
logging in, to reading the top-level mix, to drilling **Theme → Subcategory → Evidence**,
to interpreting the **confidence** of what you are looking at.

> **This is an end-user guide, not a test spec.** For the Playwright/unit test coverage
> maps, see the [E2E Test Journey Specs](../testing/e2e-specs/README.md).
>
> For the conceptual definition of the view (what the numbers mean, why they are
> effort-weighted), see the backend user guide:
> [Investment View (dev-health-ops)](https://github.com/full-chaos/dev-health-ops/blob/main/docs/user-guide/investment-view.md)
> and the shared
> [Investment Taxonomy](https://github.com/full-chaos/dev-health-ops/blob/main/docs/product/investment-taxonomy.md).

---

## Before you start

- A signed-in account on an organization that has synced at least one repository and some
  work items (issues / PRs / commits). A freshly seeded demo org
  (`admin@devhealth.example`) works well for a first look.
- One sentence to keep in mind the whole way through: **the percentages describe a
  _distribution_ of effort, not a count of tickets, and every number is a lean — read it
  as "appears," never "is."**

---

## Step 1 — Sign in and open the view

1. Sign in at `/auth/signin`.
2. From the primary navigation, open **Investment** (route: `/investment`).

You land on the **Overview** tab. Across the top you will see four tabs:

| Tab | What it is for |
| --- | -------------- |
| **Overview** | The headline mix and the story it suggests. |
| **Allocation** | The full Theme → Subcategory breakdown and where effort flows (by repo / team). |
| **Evidence** | The actual issues, PRs, and commits behind the mix. |
| **Confidence** | How much to trust the picture (evidence quality). |

> _Screenshot placeholder: `/investment` Overview tab, showing the theme mix and headline._
> `![Investment View — Overview tab](../screenshots/investment-overview.png)`

---

## Step 2 — Read the top-level theme mix

The Overview leads with the five-way **theme** split:

- Feature Delivery
- Operational / Support
- Maintenance / Tech Debt
- Quality / Reliability
- Risk / Security

A typical headline reads like:

> Effort this period **appears to lean ~60% Feature Delivery**, ~25% Quality /
> Reliability, ~15% Maintenance / Tech Debt.

**Read this as a story, not a scoreboard.** It suggests the team is mostly building new
capability, with a real slice of quality work and some maintenance — a "shipping mode"
period. It does **not** say 60% of your _tickets_ were features; it says 60% of the
**weighted effort** (weighted by code churn / active hours) leans that way. A few
high-churn items can carry the mix.

> The language in the UI is deliberately tentative — **appears, leans, suggests** — never
> "is," "was," or "detected." The view starts conversations; it does not hand down
> verdicts.

---

## Step 3 — Drill into a Theme → its Subcategories

Move to the **Allocation** tab (route: `/investment?tab=allocation`) and select a theme —
say **Feature Delivery**. It opens into its **subcategories**, the finer-grained mix:

| Subcategory | Plain meaning |
| ----------- | ------------- |
| `feature_delivery.customer` | Work driven by a specific customer ask. |
| `feature_delivery.roadmap` | Planned roadmap features. |
| `feature_delivery.enablement` | Platform/tooling that enables others to build. |

So a Feature Delivery slice might further suggest it **leans toward roadmap work** rather
than one-off customer commitments. Same effort-weighted logic, just more resolution. The
subcategory shares always roll up to the theme you opened — nothing is invented at this
level.

> _Screenshot placeholder: Allocation tab with a theme expanded into subcategories._
> `![Investment View — Allocation drill](../screenshots/investment-allocation.png)`

You may also see a **flow** view (repo / team) on this tab. If a slice is labelled
**`unassigned`**, that is **not** a kind of work — it means some effort could not be tied
back to a known repo or team (a scope-attribution gap to chase), and it never appears
inside a theme or subcategory mix.

---

## Step 4 — Drill into the Evidence behind a subcategory

Open the **Evidence** tab (route: `/investment?tab=evidence`), or click through from a
subcategory. Here the view grounds every number in the **actual linked work** — the
issues, PRs, and commits that shaped the mix:

- A list/table of the underlying items (titles, type, the repo/PR they came from).
- Short **extractive quotes** pulled directly from issue or PR text — these are verbatim
  snippets, not paraphrases, so you can see exactly what the categorization leaned on.

This is where "appears ~60% Feature Delivery" stops being abstract: you can read the two
big feature PRs that carried most of the churn and see why the mix leaned that way, and
spot the smaller bugfix and upgrade items contributing the Quality and Maintenance slices.

> _Screenshot placeholder: Evidence tab listing linked issues/PRs/commits with quotes._
> `![Investment View — Evidence table](../screenshots/investment-evidence.png)`

> **Note:** evidence quotes are only present when the backend was materialized with snippet
> persistence enabled. If quotes are sparse, the underlying items and their links are still
> shown.

---

## Step 5 — Interpret the Confidence

Before you act on anything, open the **Confidence** tab (route:
`/investment?tab=confidence`). It surfaces the **evidence-quality band** behind the mix —
**high**, **moderate**, **low**, or **very low** — reflecting how much trustworthy signal
was available (how much text there was, whether issues / PRs / commits agreed, how densely
the work was linked).

**Read the confidence band _before_ you lean on the percentages:**

- **High / moderate** — the mix rests on substantial, agreeing evidence. Reasonable to use
  as a conversation starter.
- **Low / very low** — the picture is thin. The view still shows a distribution (it never
  says "unknown"), but when evidence is too sparse it falls back to a **neutral prior** — an
  even-ish spread that effectively means _"not enough validated evidence to suggest a
  confident mix."_ Treat that as a prompt to open the **Evidence** tab and look at the
  items yourself, not as a finding.

In short: the percentages tell you which way effort **appears** to lean; the confidence
band tells you **how much weight to put on that lean.** A confident-looking 60% built on
very-low-quality evidence deserves far more skepticism than a 45% on high-quality evidence.

> _Screenshot placeholder: Confidence tab showing evidence-quality bands._
> `![Investment View — Confidence panel](../screenshots/investment-confidence.png)`

---

## What you should walk away knowing

- The Investment View shows a **distribution of effort**, not hand-applied tags.
- Percentages are **effort-weighted** (code churn / active hours), **not** % of tickets.
- You can trace any number down **Theme → Subcategory → Evidence** to real work.
- **`unassigned`** is a missing-scope state, not a category.
- Always read the **Confidence** band; low confidence means _look closer_, not _trust it_.

---

## Related

- [E2E Test Journey Specs](../testing/e2e-specs/README.md) — test-coverage maps (not end-user guides)
- [Auth System](../auth-system.md) — sign-in and access journeys
- [Investment View (dev-health-ops)](https://github.com/full-chaos/dev-health-ops/blob/main/docs/user-guide/investment-view.md) — what the numbers mean
- [Investment Taxonomy (dev-health-ops)](https://github.com/full-chaos/dev-health-ops/blob/main/docs/product/investment-taxonomy.md) — the fixed themes and subcategories

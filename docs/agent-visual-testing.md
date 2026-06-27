# Agent Visual Testing Workflow

Deterministic, copy-paste-ready procedure for agents needing to visually verify a `dev-health-web` change. Follow top-to-bottom. Each step has a verify command — do not advance until the verify succeeds.

This is the **canonical procedure** for the screenshot mandate in [`/AGENTS.md` §9 "Visual Evidence for Frontend Changes"](../../AGENTS.md#visual-evidence-for-frontend-changes) and [`web/AGENTS.md`](../AGENTS.md). When in doubt, follow this doc; it wins over inline snippets elsewhere.

---

## 0. Canonical local test account

There is exactly **one** seeded test account for local visual testing. Do not create new accounts ad-hoc.

| Field    | Value                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Email    | `admin@devhealth.example`                                                                                                                                    |
| Password | `devhealth123`                                                                                                                                               |
| Username | `admin`                                                                                                                                                      |
| Role     | superuser, owner of `default-org`                                                                                                                            |
| Org tier | enterprise                                                                                                                                                   |
| Source   | Seeded by `dev-hops fixtures generate` (see [`fixtures/generators/teams.py` L128-L149](../../ops/src/dev_health_ops/fixtures/generators/teams.py#L128-L149)) |

If you find yourself wanting a different account, stop and ask the user. Do not invent new credentials.

---

## 1. Verify the Docker stack is running

```bash
cd /Users/chris/projects/full-chaos/dev-health
docker compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}'
```

**Expected:** `postgres`, `clickhouse`, `valkey`, `api`, `web`, `worker` all show `running` and `healthy`.

**If anything is `exited` / `unhealthy` / missing:**

```bash
docker compose up -d
docker compose ps  # re-verify
```

Wait until `api` reports `healthy` before continuing — the web dev server depends on it.

---

## 2. Verify the seeded admin account exists

```bash
cd /Users/chris/projects/full-chaos/dev-health/ops
.venv/bin/dev-hops admin users list 2>&1 | rg 'admin@devhealth.example'
```

**Expected:** one row showing `admin@devhealth.example`.

**If no row returned → account is not seeded.** Go to step 3.

**If `.venv/bin/dev-hops` is missing:**

```bash
cd /Users/chris/projects/full-chaos/dev-health/ops
python -m venv .venv && .venv/bin/pip install -e .
```

---

## 3. Seed account + fixture data (only if step 2 returned empty)

A single command seeds the admin account, the default org, the membership, and ~30 days of synthetic analytics data. Do **not** create the account manually — the fixtures path is idempotent and keeps the membership/org/license rows in sync.

```bash
cd /Users/chris/projects/full-chaos/dev-health/ops
POSTGRES_URI="postgresql+asyncpg://devhealth:devhealth@localhost:5432/devhealth" \
CLICKHOUSE_URI="clickhouse://localhost:8123/default" \
.venv/bin/dev-hops fixtures generate --days 30 --seed 42
```

Flags worth knowing (rarely needed):

- `--days N` — how many days of synthetic activity to generate (default scaling is fine for screenshots; use 30)
- `--seed 42` — deterministic; use the same seed across runs so screenshots stay diffable
- `--with-work-graph` — only if your change touches Work Graph surfaces
- `--with-metrics` — only if your change touches rolled-up metrics surfaces

**Re-verify after running:**

```bash
.venv/bin/dev-hops admin users list 2>&1 | rg 'admin@devhealth.example'
```

Must return a row before continuing.

---

## 4. Verify the web dev server is reachable

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/auth/signin
```

**Expected:** `200`.

**If anything else** (connection refused, 502, 504): the web container is not ready. Wait 10s and retry. If still failing:

```bash
docker compose logs --tail=80 web
```

Resolve before continuing. Do **not** try to spin up `npm run dev` on the host while the compose web service is also running — port collision on 3000.

---

## 5. Drive the browser with the Playwright MCP

Load the `playwright` skill **before** any browser tool call:

```typescript
skill((name = "playwright"));
```

Then:

```typescript
// 5a. Navigate to sign-in
playwright_navigate((url = "http://localhost:3000/auth/signin"));
playwright_snapshot(); // get the accessibility tree to locate inputs

// 5b. Sign in with the canonical account
playwright_fill(
    (element = "Email input"),
    (ref = "<ref-from-snapshot>"),
    (text = "admin@devhealth.example"),
);
playwright_fill(
    (element = "Password input"),
    (ref = "<ref-from-snapshot>"),
    (text = "devhealth123"),
);
playwright_click((element = "Sign in button"), (ref = "<ref-from-snapshot>"));

// 5c. Wait for post-login redirect (default lands on /dashboard)
playwright_wait_for((text = "<some text known to be on /dashboard>"));
```

**Expected after click:** URL becomes `http://localhost:3000/dashboard` and the dashboard renders. If you land on `/auth/onboard` instead, the seed step did not create the membership correctly — re-run step 3.

---

## 6. Navigate to the surface you changed, then screenshot

```typescript
playwright_navigate((url = "http://localhost:3000/<your-route>"));
playwright_wait_for((text = "<text known to render only after data loads>"));
playwright_take_screenshot((filename = "chaos-<NNNN>-<short-slug>-after.png"), (fullPage = true));
```

**Naming convention:** `chaos-<ticket-number>-<short-slug>-<before|after>.png`

**For visual regressions (before/after the change):**

- Before: stash your changes (`git stash`), restart the web container if needed (`docker compose restart web`), capture `*-before.png`, then restore (`git stash pop`).
- After: capture `*-after.png` once the change is rebuilt.

**For net-new UI:** just `*-after.png`.

**Save location:** put screenshots at the repo root (`/Users/chris/projects/full-chaos/dev-health/`). They are gitignored at the repo level by convention but uploaded to the PR + Linear issue.

---

## 7. Attach to PR and Linear issue (both — non-negotiable)

```bash
# Attach to the GitHub PR via gh CLI
gh pr edit <PR-number> --body "$(gh pr view <PR-number> --json body -q .body)

![After](./chaos-<NNNN>-<slug>-after.png)
"

# Attach to the linked Linear issue
cd /Users/chris/projects/full-chaos/dev-health
linear-cli i comment CHAOS-<NNNN> \
  -b "Screenshot attached" \
  --attach ./chaos-<NNNN>-<slug>-after.png
```

If the change has a before/after pair, attach both. If you have a `SCREENSHOT-WAIVER:` line in the PR body (purely backend/type-level changes with no rendered output), state the waiver reason and skip this step.

---

## 8. Tear-down (only if you started the stack yourself)

If the stack was already up when you started, **leave it running** — other agents and the user share this worktree.

If you started it for this task and nobody else needs it:

```bash
cd /Users/chris/projects/full-chaos/dev-health
docker compose down   # keeps volumes; data + seeded account survive
```

Do **not** run `docker compose down -v` — that wipes the seeded account and forces another `fixtures generate` pass next time.

---

## Failure mode quick reference

| Symptom                                                   | Most likely cause                     | Fix                                                                                         |
| --------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `curl http://localhost:3000/auth/signin` returns 502/504  | `api` not healthy yet                 | `docker compose ps`, wait for healthy                                                       |
| Login form rejects credentials                            | Account not seeded, or wrong password | Re-run step 3; password is `devhealth123` (no quotes, no spaces)                            |
| Login succeeds but redirects to `/auth/onboard`           | Membership row missing                | Re-run step 3 — fixtures path seeds membership idempotently                                 |
| Login redirects to `/auth/signin` again with error banner | Rate-limited or stale session         | Wait 60s; clear cookies in Playwright context (`playwright_close_browser` then re-navigate) |
| Dashboard renders but charts are empty                    | Analytics fixtures not seeded         | Step 3 with both `POSTGRES_URI` **and** `CLICKHOUSE_URI` set — both are required            |
| Dashboard data looks different between runs               | Non-deterministic fixtures            | Pass `--seed 42` to `fixtures generate`                                                     |
| Playwright screenshot is blank/white                      | Page navigated but JS not hydrated    | Add `playwright_wait_for(text=...)` for text known to render only after client hydration    |

---

## What this doc deliberately does NOT cover

- Running the Playwright **automated test suites** (`playwright.config.ts`, `playwright.live.config.ts`) — those are in [`web/AGENTS.md` §Testing](../AGENTS.md) and [`web/README.md`](../README.md). This doc is specifically for **agent-driven visual verification** during implementation, not CI test runs.
- Production / staging visual testing — local stack only.
- Creating new test accounts — there is one canonical account. Talk to the user before deviating.

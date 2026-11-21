# Agent Visual Testing Workflow

Deterministic, copy-paste-ready procedure for agents needing to visually verify a `dev-health-web` change. Follow top-to-bottom, **Path A (§0) unless you own a stack**. Each step has a verify command — do not advance until the verify succeeds.

This is the **canonical procedure** for the screenshot mandate in [`/AGENTS.md` §9 "Visual Evidence for Frontend Changes"](../../AGENTS.md#visual-evidence-for-frontend-changes) and [`web/AGENTS.md`](../AGENTS.md). When in doubt, follow this doc; it wins over inline snippets elsewhere.

---

## 0. Choose a path, and the one login

| Path  | Use it when                                                    | Data it touches            |
| ----- | -------------------------------------------------------------- | -------------------------- |
| **A** | Default. Any host, and **always on bigboy** (the shared host). | None. Mock API, no stack.  |
| **B** | You own a full compose stack on your own machine.              | Your own stack and its DB. |

**Never, on a shared stack (bigboy `:3000` and the compose project behind it): sign in, restart, `docker exec`, `docker compose up/down`, run SQL, call a GraphQL mutation or `saveReport`.** Agents do not sign in to the shared stack. Read-only `docker ps` / `docker inspect` is allowed.

**The one login** (Path A, the mock API; same value as `tests/auth.setup.ts`):

| Field    | Value                     |
| -------- | ------------------------- |
| Email    | `admin@devhealth.example` |
| Password | `devhealth123`            |

`admin@test.com` is the default of the live suite (`tests/live/**`, against a live stack). It is not used by this runbook. Do not create other accounts; if you need one, stop and ask the user.

Path B only: where a Go stack seeds this account on a real stack is an open question; the Python seeder (`dev-hops fixtures generate`) is removed.

---

## A. Path A: branch web server + mock API (default; bigboy)

### A0. What serves `:3000` on bigboy

```bash
docker ps --filter name=dev-health-web --format '{{.Names}}  {{.Image}}'
```

`dev-health-web-1` runs a **prebuilt image** (the `ghcr.io/full-chaos/dev-health-web` digest shown), not your branch, and it is shared by every agent. A screenshot of `:3000` never shows your change. Look, do not touch (see §0).

A report page shows the Markdown stored in a report run. Only the report worker writes it, so on a shared stack "chosen text" means a write to shared data. Path A needs none: the report page, in test mode, reads `src/lib/reports/sample-data.ts`. You put your chosen text there in a **scratch edit** (A2) and run your own web server beside the shared one.

### A1. Worktrees, install, ports

```bash
# Your lane/scratch directory, OUTSIDE any repo checkout. Screenshots, logs, pid files live here.
export WORK=/path/to/your/scratch/visual
mkdir -p "$WORK"

# AFTER = your branch checkout. BEFORE = a second worktree of the base commit.
export AFTER=/path/to/your/dev-health-web
git -C "$AFTER" worktree add --detach "$WORK/before-tree" origin/main
export BEFORE="$WORK/before-tree"

# One pnpm store for both trees (the second install hard-links, it does not copy).
for t in "$AFTER" "$BEFORE"; do
    (cd "$t" && pnpm install --frozen-lockfile --store-dir "$WORK/pnpm-store")
done

# Three free ports: the mock API, the BEFORE server, the AFTER server.
read -r MOCK_PORT BEFORE_PORT AFTER_PORT < <(node -e '
const net = require("node:net");
const free = () => new Promise((ok) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
Promise.all([free(), free(), free()]).then((a) => console.log(a.join(" ")));')
export MOCK_PORT BEFORE_PORT AFTER_PORT
echo "$MOCK_PORT $BEFORE_PORT $AFTER_PORT"
```

**Verify:** three different numbers. Do not use `3000` (shared stack), and avoid `3001`/`8001` (the default e2e ports another agent may be using).

### A2. Choose the stored report text (scratch edit)

Write the Markdown the report page must show, exactly as the backend would store it, to a file. Use **synthetic** values (made-up names, `example.invalid` URLs). Never paste recorded production text.

```bash
cat > "$WORK/report.md" <<'MD'
# Weekly Engineering Health

## Summary
Stored text I chose: see https://example.invalid/runs/1 and ops@example.invalid.

Generated at 2026-01-01T00:00:00Z | Scope: a_b \*x\* end
MD
```

Put it into the first run of `report-1` in **both** trees (same text before and after):

```bash
cat > "$WORK/seed.cjs" <<'JS'
// usage: node seed.cjs <worktree> <markdown file>
const fs = require("node:fs");
const path = require("node:path");
const [tree, file] = process.argv.slice(2);
const target = path.join(tree, "src/lib/reports/sample-data.ts");
const text = fs.readFileSync(file, "utf8");
const source = fs.readFileSync(target, "utf8");
const pattern = /(id: "run-1-1"[\s\S]*?renderedMarkdown:\s*)"(?:[^"\\]|\\.)*"/u;
if (!pattern.test(source)) throw new Error("run-1-1 renderedMarkdown not found");
fs.writeFileSync(target, source.replace(pattern, (_m, head) => head + JSON.stringify(text)));
JS
for t in "$AFTER" "$BEFORE"; do node "$WORK/seed.cjs" "$t" "$WORK/report.md"; done
git -C "$AFTER" diff --stat -- src/lib/reports/sample-data.ts
```

**Verify:** `diff --stat` shows `src/lib/reports/sample-data.ts | 2 +-`. The report id for the URL is `report-1`.

**This edit is scratch.** Revert it in A6 and **never commit it** (stage named paths only; never `git add -A`).

### A3. Start the mock API and the two web servers

Same way the e2e suite starts them (`playwright.config.ts`): the mock answers sign-in and the token reads, the web servers run in test mode and read their backend from the mock.

```bash
cd "$AFTER"
MOCK_SERVER_PORT=$MOCK_PORT ./node_modules/.bin/tsx ./tests/mocks/http-server.ts \
    < /dev/null > "$WORK/mock.log" 2>&1 &
echo $! > "$WORK/mock.pid"
until curl -fsS -o /dev/null "http://127.0.0.1:$MOCK_PORT/health"; do sleep 1; done

start_web() { # <worktree> <port> <label>
    (
        cd "$1"
        export AUTH_ACCESS_TOKEN_ISSUER=https://auth.e2e.test
        export E2E_AUTH_ISSUER_ORIGIN="http://127.0.0.1:$MOCK_PORT"
        export NODE_OPTIONS="--import file://$1/ci/next-no-registry-check.mjs --import file://$1/ci/e2e-auth-issuer-fetch.mjs"
        export PLAYWRIGHT_TEST=true DEV_HEALTH_TEST_MODE=true NEXT_PUBLIC_DEV_HEALTH_TEST_MODE=true
        export NEXT_PUBLIC_GUIDED_ONBOARDING=false BACKEND_URL="http://127.0.0.1:$MOCK_PORT"
        ./node_modules/.bin/next dev --hostname 127.0.0.1 --port "$2" \
            < /dev/null > "$WORK/$3.log" 2>&1 &
        echo $! > "$WORK/$3.pid"
    )
}
start_web "$BEFORE" "$BEFORE_PORT" before
start_web "$AFTER" "$AFTER_PORT" after
for p in "$BEFORE_PORT" "$AFTER_PORT"; do
    until curl -fsS -o /dev/null "http://127.0.0.1:$p/auth/signin"; do sleep 2; done
done
```

**Verify:** the loops end (mock `/health` is 200, both `/auth/signin` are 200). If a loop does not end in 2 minutes, read `$WORK/*.log` (see the failure table). The `.pid` files are how you stop them in A6: **kill by saved PID only, never by name**.

### A4. Sign in and take the screenshots

```bash
cat > "$WORK/shot.cjs" <<'JS'
// usage: NODE_PATH=<tree>/node_modules node shot.cjs <base url> <route> <wait-for text> <out.png>
const { chromium } = require("@playwright/test");
const [base, route, waitText, out] = process.argv.slice(2);
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${base}/auth/signin`);
    await page.getByLabel("Email").fill("admin@devhealth.example");
    await page.getByLabel("Password").fill("devhealth123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth/"), { timeout: 60000 });
    await page.goto(`${base}${route}`);
    await page.getByText(waitText).first().waitFor({ timeout: 60000 });
    await page.screenshot({ path: out, fullPage: true });
    await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
JS
mkdir -p "$WORK/shots"
NODE_PATH="$BEFORE/node_modules" node "$WORK/shot.cjs" "http://127.0.0.1:$BEFORE_PORT" /reports/report-1 "Stored text I chose" "$WORK/shots/before.png"
NODE_PATH="$AFTER/node_modules" node "$WORK/shot.cjs" "http://127.0.0.1:$AFTER_PORT" /reports/report-1 "Stored text I chose" "$WORK/shots/after.png"
```

The wait-for text (4th word of each command) must come from the Markdown you stored in A2, not from the page title: the page frame paints before the Markdown does, and a shot taken too early shows an empty report body. Change it when you change `report.md`.

**Verify:** both commands exit 0 and both PNG files exist. Open them and check that the stored text from A2 is visible. Naming for the PR and the ticket: `chaos-<NNNN>-<short-slug>-<before|after>.png` (copy the files to those names).

You may use the Playwright MCP (§5) instead of `shot.cjs`: point it at `http://127.0.0.1:$AFTER_PORT`. Same login (§0).

### A5. Attach

Go to §7.

### A6. Stop everything and clean up

```bash
for label in before after mock; do
    pid=$(cat "$WORK/$label.pid")
    for child in $(ps -o pid= --ppid "$pid"); do kill "$child"; done
    kill "$pid"
done
sleep 2
for t in "$AFTER" "$BEFORE"; do git -C "$t" checkout -- src/lib/reports/sample-data.ts; done # revert the scratch edit
git -C "$AFTER" status --short                                    # must show only your real changes
git -C "$AFTER" worktree remove "$BEFORE"                         # no --force; a dirty tree means you did not revert
rm -rf "$WORK/pnpm-store"
```

**Verify:** `git status` has no `sample-data.ts`; ports are free (`curl` to each port fails). If a process is still up, find it by its saved PID (`ps -p <pid>`) and kill that PID; do not use name-based kills on a shared host.

---

## Path B: your own compose stack

Only when you own the stack on your own machine. Never on bigboy.

## 1. Verify the Docker stack is running

```bash
cd <your dev-health checkout>
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
cd <your dev-health checkout>/ops
dho admin users list 2>&1 | rg 'admin@devhealth.example'
```

**Expected:** one row showing `admin@devhealth.example`.

**If no row returned → account is not seeded.** Go to step 3.

**If `dho` is missing:** it is the Go binary built from `ops/cmd/dho` (`go build -o dho ./cmd/dho` in `ops/`), or the image `ghcr.io/full-chaos/dev-health-go-dho` (its entrypoint is `dho`; whether the package is public is unverified). `dho admin users list` reads `POSTGRES_URI` (or `MIGRATION_DATABASE_URI`), see `internal/adminops/users.go`.

---

## 3. Seed account + fixture data (only if step 2 returned empty)

The command below loads ~30 days of synthetic analytics data into ClickHouse. UNVERIFIED: the Python verb also seeded the admin account, the default org and the membership; whether `dho fixtures generate` does is an open question, and `dho` has no step documented here that does. Do **not** create the account manually; ask the user if step 2 stays empty after this command.

```bash
cd <your dev-health checkout>/ops
dho fixtures generate --sink "clickhouse://localhost:8123/default" --days 30 --seed 42
```

Flags worth knowing (rarely needed):

- `--days N` — how many days of synthetic activity to generate (default scaling is fine for screenshots; use 30)
- `--seed 42` — deterministic; use the same seed across runs so screenshots stay diffable
- `--with-work-graph` — only if your change touches Work Graph surfaces
- `--with-metrics` — only if your change touches rolled-up metrics surfaces

**Re-verify after running:**

```bash
dho admin users list 2>&1 | rg 'admin@devhealth.example'
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

Path A: use `http://127.0.0.1:$AFTER_PORT` instead of `http://localhost:3000` in every URL below; the login is the one in §0. (A4 gives a script that needs no MCP.) Steps 1 to 4 and 8 are Path B only.

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

- Before: a second worktree of the base commit with its own web server (Path A, A1 and A3). Capture `*-before.png` there.
- After: capture `*-after.png` from your branch once the change is rebuilt.
- Do not stash or restart a stack you share to get a "before".

**For net-new UI:** just `*-after.png`.

**Save location:** write screenshots to a scratch directory outside the repo (or to a path that git ignores) so they are never committed. Each file is uploaded to the PR and the Linear issue in step 7.

---

## 7. Attach to PR and Linear issue (both — non-negotiable)

Attach to the GitHub PR with `gh --attach` (gh 2.102.0 documents it as `--attach file  Attach an image or video file, in '<file>#<image alt text>' format`). The file is uploaded and appended to the PR body; without `#<alt text>` the filename is the alt text. `gh pr create`, `gh pr comment` and `gh issue comment` take the same flag.

```bash
gh pr edit <PR-number> --attach './chaos-<NNNN>-<slug>-after.png#<alt text>'
```

Repeat the flag for more files: `--attach ./before.png --attach ./after.png`.

Attach to the linked Linear issue with the Linear MCP tools (not a CLI): upload each file with `prepare_attachment_upload` and `create_attachment_from_upload`, then add a comment with `save_comment`.

If the change has a before/after pair, attach both. If you have a `SCREENSHOT-WAIVER:` line in the PR body (purely backend/type-level changes with no rendered output), state the waiver reason and skip this step.

---

## 8. Tear-down (Path B only, and only if you started the stack yourself)

Path A tear-down is A6.

If the stack was already up when you started, **leave it running** — other agents and the user share this worktree.

If you started it for this task and nobody else needs it:

```bash
cd <your dev-health checkout>
docker compose down   # keeps volumes; data + seeded account survive
```

Do **not** run `docker compose down -v` — that wipes the seeded account and forces another `fixtures generate` pass next time.

---

## Failure mode quick reference

| Symptom                                                                       | Most likely cause                                                                                           | Fix                                                                                         |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Path A: mock `/health` never answers; or sign-in loops back to `/auth/signin` | Mock not started, wrong `MOCK_PORT`, or `E2E_AUTH_ISSUER_ORIGIN` / `NODE_OPTIONS` not set on the web server | Read `$WORK/mock.log` and `$WORK/after.log`; restart with the A3 env                        |
| Path A: port already in use                                                   | Picked port was taken in between                                                                            | Stop by saved PID (A6), pick new ports (A1)                                                 |
| Path A: report page says "No rendered content available"                      | Seed went to a run that is not the first one with Markdown                                                  | Re-run A2 and check `diff --stat`                                                           |
| `curl http://localhost:3000/auth/signin` returns 502/504                      | `api` not healthy yet                                                                                       | `docker compose ps`, wait for healthy                                                       |
| Login form rejects credentials                                                | Account not seeded, or wrong password                                                                       | Re-run step 3; password is `devhealth123` (no quotes, no spaces)                            |
| Login succeeds but redirects to `/auth/onboard`                               | Membership row missing                                                                                      | Re-run step 3 — fixtures path seeds membership idempotently                                 |
| Login redirects to `/auth/signin` again with error banner                     | Rate-limited or stale session                                                                               | Wait 60s; clear cookies in Playwright context (`playwright_close_browser` then re-navigate) |
| Dashboard renders but charts are empty                                        | Analytics fixtures not seeded                                                                               | Step 3 with both `POSTGRES_URI` **and** `CLICKHOUSE_URI` set — both are required            |
| Dashboard data looks different between runs                                   | Non-deterministic fixtures                                                                                  | Pass `--seed 42` to `fixtures generate`                                                     |
| Playwright screenshot is blank/white                                          | Page navigated but JS not hydrated                                                                          | Add `playwright_wait_for(text=...)` for text known to render only after client hydration    |

---

## What this doc deliberately does NOT cover

- Running the Playwright **automated test suites** (`playwright.config.ts`, `playwright.live.config.ts`) — those are in [`web/AGENTS.md` §Testing](../AGENTS.md) and [`web/README.md`](../README.md). This doc is specifically for **agent-driven visual verification** during implementation, not CI test runs.
- Production / staging visual testing — local stack only.
- Creating new test accounts — there is one canonical account. Talk to the user before deviating.

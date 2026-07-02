import { expect, test } from "@playwright/test";

// Seeded in tests/mocks/handlers.ts MOCK_CUSTOMER_PUSH_SOURCES/_TOKENS/_BATCHES.
const SEEDED_SOURCE_ID = "cps-github-1";
const SEEDED_SOURCE_INSTANCE = "meridian/api";
const SEEDED_TOKEN_NAME = "CI runner";
const SEEDED_TOKEN_ID = "cpt-1";
const COMPLETED_BATCH_ID = "batch-completed-1";
const PARTIAL_BATCH_ID = "batch-partial-1";

test.describe("Provider detail — mode cards (D3/D4)", () => {
    test("provider detail page renders both Managed sync and Customer push cards", async ({
        page,
    }) => {
        await page.goto("/org/admin/integrations/github");

        await expect(page.getByRole("heading", { name: "Managed sync" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Customer push" })).toBeVisible();
    });

    test("custom provider renders only the Customer push card, no managed-sync form", async ({
        page,
    }) => {
        await page.goto("/org/admin/integrations/custom");

        await expect(page.getByRole("heading", { name: "Customer push" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Managed sync" })).toHaveCount(0);
        await expect(page.getByRole("heading", { name: "Saved Credentials" })).toHaveCount(0);
    });
});

test.describe("Create customer-push source", () => {
    test("happy path: fill form, submit, redirected to the new source overview", async ({
        page,
    }) => {
        await page.goto("/org/admin/integrations/linear/customer-push/new");

        await page.locator("#customer-push-display-name").fill("Linear e2e team");
        await page.locator("#customer-push-instance").fill("E2E");
        await page.getByRole("button", { name: "Create customer-push source" }).click();

        await expect(page.getByRole("heading", { name: "Linear e2e team" })).toBeVisible();
        await expect(page.getByText("Customer-push source · E2E", { exact: true })).toBeVisible();
    });

    test("duplicate/conflicting source shows the real backend one-active-owner message", async ({
        page,
    }) => {
        await page.goto("/org/admin/integrations/github/customer-push/new");

        await page.locator("#customer-push-display-name").fill("Duplicate source");
        await page.locator("#customer-push-instance").fill(SEEDED_SOURCE_INSTANCE);
        await page.getByRole("button", { name: "Create customer-push source" }).click();

        await expect(page.getByText("One-active-owner conflict")).toBeVisible();
        await expect(page.getByText(/already registered for system='github'/)).toBeVisible();
        // Stays on the form — no redirect on conflict.
        await expect(page).toHaveURL(/\/customer-push\/new$/);
    });

    test("missing instance shows the design-doc validation copy client-side", async ({ page }) => {
        await page.goto("/org/admin/integrations/github/customer-push/new");
        await page.getByRole("button", { name: "Create customer-push source" }).click();
        await expect(page.getByText(/enter a stable provider instance/i)).toBeVisible();
    });
});

test.describe("Credential creation — one-time token display (D9)", () => {
    test("create token flow: one-time panel renders, then the plaintext is never shown again", async ({
        page,
    }) => {
        await page.goto(
            `/org/admin/integrations/github/customer-push/${SEEDED_SOURCE_ID}/credentials/new`,
        );

        await page.locator("#customer-push-token-name").fill("e2e runner token");
        await page.getByRole("button", { name: "Create credential" }).click();

        await expect(page.getByText("e2e runner token — token created")).toBeVisible();
        const tokenCode = page.locator("code");
        await expect(tokenCode).toContainText("fcpush_");
        const tokenText = (await tokenCode.textContent())?.trim() ?? "";
        expect(tokenText.startsWith("fcpush_")).toBe(true);

        await page.getByRole("button", { name: "Done" }).click();

        // Navigate to the credentials list — the new token must appear by
        // name/metadata only, never with the plaintext secret rendered.
        await page.goto(
            `/org/admin/integrations/github/customer-push/${SEEDED_SOURCE_ID}/credentials`,
        );
        await expect(page.getByText("e2e runner token", { exact: true })).toBeVisible();
        await expect(page.getByText(tokenText)).toHaveCount(0);

        // Contract-level guard (adversarial-review finding): the token-LIST
        // response itself must not re-serve the one-time plaintext — asserting
        // only that the UI hides it would let a leaking API pass.
        const listResp = await page.request.get(
            `/api/v1/admin/customer-push/sources/${SEEDED_SOURCE_ID}/tokens`,
        );
        expect(listResp.ok()).toBe(true);
        const listBody = await listResp.text();
        expect(listBody).not.toContain(tokenText);
        for (const row of JSON.parse(listBody) as Array<Record<string, unknown>>) {
            expect(row).not.toHaveProperty("token");
        }
    });
});

test.describe("Credential management — rotate/revoke", () => {
    test("rotate shows a new one-time token; revoke disables the row", async ({ page }) => {
        await page.goto(
            `/org/admin/integrations/github/customer-push/${SEEDED_SOURCE_ID}/credentials`,
        );

        // Scope to the seeded token's row via data-testid — other tests in
        // this file create additional tokens against the same seeded source,
        // so an unscoped "Rotate"/"Revoke" button lookup is ambiguous.
        const row = page.getByTestId(`token-row-${SEEDED_TOKEN_ID}`);
        await row.getByRole("button", { name: "Rotate" }).click();

        await expect(page.getByText(`${SEEDED_TOKEN_NAME} — token created`)).toBeVisible();
        await expect(page.locator("code")).toContainText("fcpush_");
        await page.getByRole("button", { name: "Done" }).click();

        // Rotate is a hard cutover — the old row (seeded token id) is now
        // revoked; the new token has a fresh id we don't know statically, so
        // assert on the visible "Revoked" status text scoped to the old row.
        const oldRow = page.getByTestId(`token-row-${SEEDED_TOKEN_ID}`);
        await expect(oldRow.getByText("Revoked", { exact: true })).toBeVisible();
        await expect(oldRow.getByRole("button", { name: "Rotate" })).toBeDisabled();
    });

    test("revoke via confirm dialog disables the row", async ({ page }) => {
        // Create a fresh token for this test — the seeded token may already
        // be revoked by the "rotate" test above (shared MSW mock state
        // across tests in this file), which would make its Revoke button
        // permanently disabled and hang this test's click.
        await page.goto(
            `/org/admin/integrations/github/customer-push/${SEEDED_SOURCE_ID}/credentials/new`,
        );
        await page.locator("#customer-push-token-name").fill("revoke-confirm-e2e-token");
        await page.getByRole("button", { name: "Create credential" }).click();
        await expect(page.getByText("revoke-confirm-e2e-token — token created")).toBeVisible();
        await page.getByRole("button", { name: "Done" }).click();

        // "Done" returns to the create form, not the list — navigate there
        // explicitly to find the row for the token just created.
        await page.goto(
            `/org/admin/integrations/github/customer-push/${SEEDED_SOURCE_ID}/credentials`,
        );
        const row = page.locator('[data-testid^="token-row-"]', {
            hasText: "revoke-confirm-e2e-token",
        });
        await row.getByRole("button", { name: "Revoke" }).click();
        await expect(page.getByRole("heading", { name: "Revoke credential" })).toBeVisible();
        await row.getByRole("button", { name: "Revoke" }).last().click();

        await expect(row.getByText("Revoked", { exact: true })).toBeVisible();
        await expect(row.getByRole("button", { name: "Rotate" })).toBeDisabled();
        await expect(row.getByRole("button", { name: "Revoke" }).first()).toBeDisabled();
    });
});

test.describe("Runner setup examples", () => {
    test("all 5 tabs render; cURL tab uses the real external-ingest data-plane path", async ({
        page,
    }) => {
        await page.goto(
            `/org/admin/integrations/github/customer-push/${SEEDED_SOURCE_ID}/examples`,
        );

        for (const label of [
            "GitHub Actions",
            "GitLab Runner",
            "Generic Docker",
            "cURL",
            "Webhook relay",
        ]) {
            await expect(page.getByRole("button", { name: label, exact: false })).toBeVisible();
        }

        await page.getByRole("button", { name: "cURL", exact: false }).click();
        await expect(page.locator("pre code")).toContainText("/api/v1/external-ingest/batches");
    });
});

test.describe("Validate payload — validate-only in v1 (CC25 overrule)", () => {
    // The full validate round-trip (accepted state, rejected-record table) is
    // covered at unit level with the proxy seam enabled
    // (ValidatePayloadPanel.test.tsx): the admin validate proxy ships with
    // CHAOS-2695, so in the real app the submit path is hard-gated off — a
    // live e2e round-trip here would only ever exercise the MSW mock while
    // production 404s (adversarial-review finding). Restore the round-trip
    // e2e when CHAOS-2695 flips VALIDATE_PROXY_AVAILABLE.
    test("submit is gated off with guidance until the validate proxy lands", async ({ page }) => {
        await page.goto(
            `/org/admin/integrations/github/customer-push/${SEEDED_SOURCE_ID}/validate`,
        );

        await expect(page.getByText(/Server-side validation isn't available yet/)).toBeVisible();

        // Payload prep still works (paste + sample) — only submission is gated.
        await page.getByRole("button", { name: "Use sample" }).click();
        await expect(page.getByPlaceholder(/schemaVersion/)).toHaveValue(/external-ingest.v1/);
        await expect(page.getByRole("button", { name: "Validate payload" })).toBeDisabled();

        // Regression guard: the console-push CTA was cut from v1 (CC25) —
        // Screen 5 is validate-only, there must be no push button anywhere.
        await expect(page.getByRole("button", { name: /push this payload/i })).toHaveCount(0);
    });
});

test.describe("Ingest status — batch list + drilldown", () => {
    test("empty state shows guidance linking to Validate and Examples", async ({ page }) => {
        // A freshly created source has zero batches in the mock store.
        await page.goto("/org/admin/integrations/jira/customer-push/new");
        await page.locator("#customer-push-display-name").fill("Jira e2e project");
        await page.locator("#customer-push-instance").fill("E2EJ");
        await page.getByRole("button", { name: "Create customer-push source" }).click();
        // Wait for (and verify) the actual redirect target rather than
        // reading page.url() after a generic visibility assertion — pins
        // down the provider segment so a misrouted redirect fails loudly
        // here instead of silently reusing a stale/wrong URL below.
        await page.waitForURL(/\/org\/admin\/integrations\/jira\/customer-push\/[^/]+$/);
        await expect(page.getByRole("heading", { name: "Jira e2e project" })).toBeVisible();
        const sourceUrl = page.url();

        await page.goto(`${sourceUrl}/batches`);
        await expect(page.getByText(/No batches yet/)).toBeVisible();
        await expect(page.getByRole("link", { name: "Validate" })).toBeVisible();
        await expect(page.getByRole("link", { name: "CI job" })).toBeVisible();
    });

    test("seeded batches show status badges and link to their drilldown", async ({ page }) => {
        await page.goto(`/org/admin/integrations/github/customer-push/${SEEDED_SOURCE_ID}/batches`);

        // Scope to the table body — "Completed" is also a column header
        // (the batch's completed_at timestamp column).
        const tbody = page.locator("tbody");
        await expect(tbody.getByText("Completed", { exact: true })).toBeVisible();
        await expect(tbody.getByText("Partial", { exact: true })).toBeVisible();

        // Only the ingestion-id cell (first column) is a link — the status
        // badge itself is not clickable.
        await page
            .locator("tbody tr", { has: page.getByText("Completed", { exact: true }) })
            .getByRole("link")
            .click();
        await expect(page).toHaveURL(new RegExp(`/batches/${COMPLETED_BATCH_ID}$`));
    });

    test("batch detail renders rejected records with the correct empty-state copy", async ({
        page,
    }) => {
        await page.goto(
            `/org/admin/integrations/github/customer-push/${SEEDED_SOURCE_ID}/batches/${PARTIAL_BATCH_ID}`,
        );
        await expect(page.getByRole("columnheader", { name: "Index" })).toBeVisible();
        await expect(
            page.getByRole("cell", { name: "missing_external_id", exact: true }),
        ).toBeVisible();

        await page.goto(
            `/org/admin/integrations/github/customer-push/${SEEDED_SOURCE_ID}/batches/${COMPLETED_BATCH_ID}`,
        );
        await expect(page.getByText("No rejected records.")).toBeVisible();
    });
});

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

        await expect(page).toHaveURL(/\/customer-push\/[^/]+$/);
        await expect(page.getByRole("heading", { name: "Linear e2e team" })).toBeVisible();
        await expect(page.getByText("Customer-push source · E2E", { exact: true })).toBeVisible();
    });

    test("one-active-owner conflict (managed sync already owns this instance) shows the ownership validation message", async ({
        page,
    }) => {
        await page.goto("/org/admin/integrations/github/customer-push/new");

        await page.locator("#customer-push-display-name").fill("Owned by managed sync");
        // Mock sentinel simulating a matching, enabled managed-sync source (CC5).
        await page.locator("#customer-push-instance").fill("owned-by-managed-sync");
        await page.getByRole("button", { name: "Create customer-push source" }).click();

        await expect(page.getByText("One-active-owner conflict")).toBeVisible();
        await expect(
            page.getByText(
                "A managed github sync source already owns 'owned-by-managed-sync' in this organization; disable it before enabling customer-push for the same instance.",
            ),
        ).toBeVisible();
        // Stays on the form — no redirect on conflict.
        await expect(page).toHaveURL(/\/customer-push\/new$/);
    });

    test("registering the same source instance twice shows the distinct duplicate-registration message", async ({
        page,
    }) => {
        await page.goto("/org/admin/integrations/github/customer-push/new");

        await page.locator("#customer-push-display-name").fill("Duplicate source");
        await page.locator("#customer-push-instance").fill(SEEDED_SOURCE_INSTANCE);
        await page.getByRole("button", { name: "Create customer-push source" }).click();

        await expect(
            page.getByText(
                `A source is already registered for system='github' instance='${SEEDED_SOURCE_INSTANCE}' in this organization`,
            ),
        ).toBeVisible();
        // This is a plain duplicate-registration error, not the
        // one-active-owner conflict — it must not show that heading.
        await expect(page.getByText("One-active-owner conflict")).toHaveCount(0);
        await expect(page).toHaveURL(/\/customer-push\/new$/);
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
    });
});

test.describe("Credential management — rotate/revoke", () => {
    test("rotate shows a new one-time token and hard-cuts-over the old row (Design Decision 16)", async ({
        page,
    }) => {
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

        // Real backend: rotate is a hard, immediate cutover — it revokes
        // this row and mints a NEW token id, so the ORIGINAL row (same
        // testid) must now show revoked/disabled once the page refreshes.
        const rowAfterRotate = page.getByTestId(`token-row-${SEEDED_TOKEN_ID}`);
        await expect(rowAfterRotate.getByText("Revoked", { exact: true })).toBeVisible();
        await expect(rowAfterRotate.getByRole("button", { name: "Rotate" })).toBeDisabled();
        await expect(rowAfterRotate.getByRole("button", { name: "Revoke" })).toBeDisabled();

        // ...and a second "CI runner" row now exists for the new token.
        await expect(page.getByText("CI runner")).toHaveCount(2);
    });

    test("revoke requires confirmation and disables the row", async ({ page }) => {
        // Create a fresh token so this test doesn't depend on rotate's
        // dynamic new-row id from the test above.
        await page.goto(
            `/org/admin/integrations/github/customer-push/${SEEDED_SOURCE_ID}/credentials/new`,
        );
        await page.locator("#customer-push-token-name").fill("Revoke-me token");
        await page.getByRole("button", { name: "Create credential" }).click();
        await expect(page.getByText("Revoke-me token — token created")).toBeVisible();
        await page.getByRole("button", { name: "Done" }).click();

        // "Done" on the create form just clears local state back to a blank
        // form (no navigation) — visit the list page to find the new row.
        await page.goto(
            `/org/admin/integrations/github/customer-push/${SEEDED_SOURCE_ID}/credentials`,
        );
        const row = page
            .locator('[data-testid^="token-row-"]')
            .filter({ hasText: "Revoke-me token" });
        // The confirm dialog renders inside the row's own subtree, so
        // "Revoke" resolves to two buttons here: the trigger (first) and
        // the modal's confirm action (last).
        await row.getByRole("button", { name: "Revoke" }).first().click();
        await expect(page.getByRole("heading", { name: "Revoke credential" })).toBeVisible();
        await row.getByRole("button", { name: "Revoke" }).last().click();

        // Exact match — a substring match also hits the "Token revoked" toast.
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
    test("invalid payload renders the rejected-record error table", async ({ page }) => {
        await page.goto(
            `/org/admin/integrations/github/customer-push/${SEEDED_SOURCE_ID}/validate`,
        );

        const invalidPayload = JSON.stringify({
            schemaVersion: "external-ingest.v1",
            idempotencyKey: "e2e-invalid",
            source: { type: "customer_push", system: "github", instance: SEEDED_SOURCE_INSTANCE },
            window: { startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T01:00:00Z" },
            records: [{ kind: "pull_request.v1", payload: {} }],
        });
        await page.getByPlaceholder(/schemaVersion/).fill(invalidPayload);
        await page.getByRole("button", { name: "Validate payload" }).click();

        await expect(page.getByRole("columnheader", { name: "Index" })).toBeVisible();
        await expect(page.getByRole("columnheader", { name: "Path" })).toBeVisible();
        await expect(page.getByRole("columnheader", { name: "Message" })).toBeVisible();
        await expect(page.getByText("externalId is required")).toBeVisible();

        // Regression guard: the console-push CTA was cut from v1 (CC25) —
        // Screen 5 is validate-only, there must be no push button anywhere.
        await expect(page.getByRole("button", { name: /push this payload/i })).toHaveCount(0);
    });

    test("valid payload renders the accepted-count success state", async ({ page }) => {
        await page.goto(
            `/org/admin/integrations/github/customer-push/${SEEDED_SOURCE_ID}/validate`,
        );

        const validPayload = JSON.stringify({
            schemaVersion: "external-ingest.v1",
            idempotencyKey: "e2e-valid",
            source: { type: "customer_push", system: "github", instance: SEEDED_SOURCE_INSTANCE },
            window: { startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T01:00:00Z" },
            records: [
                {
                    kind: "repository.v1",
                    externalId: SEEDED_SOURCE_INSTANCE,
                    payload: { externalId: SEEDED_SOURCE_INSTANCE, name: "api" },
                },
            ],
        });
        await page.getByPlaceholder(/schemaVersion/).fill(validPayload);
        await page.getByRole("button", { name: "Validate payload" }).click();

        await expect(page.getByText(/Payload is valid/)).toBeVisible();
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
        await expect(page.getByRole("heading", { name: "Jira e2e project" })).toBeVisible();
        await expect(page).not.toHaveURL(/\/customer-push\/new$/);
        const sourceUrl = page.url();

        await page.goto(`${sourceUrl}/batches`);
        await expect(page.getByText(/No batches yet/)).toBeVisible();
        await expect(page.getByRole("link", { name: "Validate" })).toBeVisible();
        await expect(page.getByRole("link", { name: "CI job" })).toBeVisible();
    });

    test("seeded batches show status badges and link to their drilldown", async ({ page }) => {
        await page.goto(`/org/admin/integrations/github/customer-push/${SEEDED_SOURCE_ID}/batches`);

        await expect(page.getByText("Completed", { exact: true })).toBeVisible();
        await expect(page.getByText("Partial", { exact: true })).toBeVisible();

        await page.getByText("Completed", { exact: true }).click();
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

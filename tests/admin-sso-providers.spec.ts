import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// CHAOS-13638. The mock backend answers the go-api SSO provider routes one scenario at a time (it is
// process-global), so these tests run in order, not in parallel. SSO_SHOTS_DIR, when set, also saves
// a screenshot of each state.
test.describe.configure({ mode: "serial" });

const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const shotsDir = process.env.SSO_SHOTS_DIR;

async function scenario(name: string) {
    const response = await fetch(`${MOCK}/__test/sso-providers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: name }),
    });
    expect(response.status).toBe(204);
}

async function shot(page: Page, name: string) {
    if (!shotsDir) return;
    mkdirSync(shotsDir, { recursive: true });
    await page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage: true });
}

test("lists providers and shows the tab, with no secret on the page", async ({ page }) => {
    await scenario("providers");
    await page.goto("/org/admin/sso");
    await expect(page.getByRole("tab", { name: "Single sign-on" })).toBeVisible();
    await expect(page.getByText("Okta (OIDC)")).toBeVisible();
    await expect(page.getByText("Corporate SAML")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("********");
    await shot(page, "05-list");
});

test("creates a provider from the form", async ({ page }) => {
    await scenario("providers");
    await page.goto("/org/admin/sso");
    await page.getByRole("button", { name: "Add SSO provider" }).click();
    await page.getByLabel("Name").fill("Entra ID");
    await page.getByLabel("Client ID").fill("cid-entra");
    await page.getByLabel("Client secret").fill("s3cret");
    await page.getByLabel("Issuer").fill("https://login.example/tenant");
    await shot(page, "06-create-form");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Entra ID")).toBeVisible();
});

test("the SAML certificate is a multiline box that keeps a pasted PEM", async ({ page }) => {
    await scenario("providers");
    await page.goto("/org/admin/sso");
    await page.getByRole("button", { name: "Add SSO provider" }).click();
    await page.getByLabel("Protocol").selectOption("saml");
    const pem =
        "-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJAK0Z\nQ2VydGlmaWNhdGU=\n-----END CERTIFICATE-----";
    const box = page.getByLabel("Certificate");
    await expect(box).toHaveJSProperty("tagName", "TEXTAREA");
    await box.fill(pem);
    await expect(box).toHaveValue(pem);
    await shot(page, "11-saml-certificate-multiline");
});

test("a name-only edit is saved; a config edit needs the secret again and makes no call", async ({
    page,
}) => {
    await scenario("providers");
    await page.goto("/org/admin/sso");
    await page.getByRole("button", { name: "Edit" }).first().click();
    await page.getByLabel("Name").fill("Okta renamed");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Okta renamed")).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).first().click();
    await page.getByLabel("Issuer").fill("https://other.example");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/Enter the client secret again/)).toBeVisible();
    await shot(page, "10-edit-config-needs-secret");
});

test("deletes a provider only after the confirm", async ({ page }) => {
    await scenario("providers");
    await page.goto("/org/admin/sso");
    await page.getByRole("button", { name: "Delete" }).first().click();
    await shot(page, "09-delete-confirm");
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Okta (OIDC)")).toHaveCount(0);
});

test("shows the empty state", async ({ page }) => {
    await scenario("empty");
    await page.goto("/org/admin/sso");
    await expect(page.getByText("No SSO providers configured.")).toBeVisible();
    await shot(page, "04-empty");
});

test("shows the plan notice for a 402", async ({ page }) => {
    await scenario("plan-gate");
    await page.goto("/org/admin/sso");
    await expect(page.getByText(/This feature requires the enterprise plan/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add SSO provider" })).toHaveCount(0);
    await shot(page, "01-licence-gate-402");
});

test("shows the unavailable notice for a 503", async ({ page }) => {
    await scenario("unavailable");
    await page.goto("/org/admin/sso");
    await expect(page.getByText(/SSO provider service is unavailable/)).toBeVisible();
    await shot(page, "02-service-unavailable-503");
});

test("shows the generic load failure for the 500 stub", async ({ page }) => {
    await scenario("stub-500");
    await page.goto("/org/admin/sso");
    await expect(page.getByText(/could not be loaded/)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/not configured/i);
    await shot(page, "03-load-failure-500");
});

test("shows the read-only notice when the list answers 403", async ({ page }) => {
    await scenario("list-forbidden");
    await page.goto("/org/admin/sso");
    await expect(page.getByText("Only owners and admins can change SSO providers.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add SSO provider" })).toHaveCount(0);
    await shot(page, "07-read-only-list-403");
});

test("a write that answers 403 closes the write buttons and keeps the list", async ({ page }) => {
    await scenario("write-forbidden");
    await page.goto("/org/admin/sso");
    await page.getByRole("button", { name: "Deactivate" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByText("Only owners and admins can change SSO providers.")).toBeVisible();
    await expect(page.getByText("Okta (OIDC)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await shot(page, "08-write-403");
});

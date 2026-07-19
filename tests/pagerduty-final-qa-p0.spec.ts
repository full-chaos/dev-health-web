import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
    captureScenario,
    collectBrowserSignals,
    EVIDENCE_ROOT,
    pagerDutyObservations,
    resetEvidence,
    resizeForScenario,
    setPagerDutyScenario,
    type QaScenario,
} from "./pagerduty-final-qa.helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
    await resetEvidence();
});

test("P0 global Add Provider routes PagerDuty to the dedicated setup", async ({
    page,
    request,
}, testInfo) => {
    const scenario: QaScenario = {
        id: "01-global-add-provider-routing",
        priority: "P0",
        title: "Global Add Provider routes PagerDuty to dedicated setup",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "not-connected");
    await resizeForScenario(page, scenario.viewport);
    const signals = collectBrowserSignals(page);
    await page.goto("/org/admin/integrations");
    await page.getByRole("button", { name: "Add Provider" }).click();
    await page.getByRole("link", { name: "PagerDuty" }).click();
    await expect(page.getByRole("heading", { name: "Connect PagerDuty" })).toBeVisible();
    await captureScenario(page, testInfo, scenario, signals);
    const receipt = JSON.parse(
        await readFile(
            path.join(EVIDENCE_ROOT, `${scenario.id}-${scenario.viewport}.json`),
            "utf8",
        ),
    );
    expect(receipt.network.non_ok_responses).toEqual([]);
    expect(receipt.network.requestfailed).toEqual([]);
    expect(receipt.authenticated_shell_ready).toBe(true);
    expect(receipt.account_control_resolved).toBe(true);
    expect(receipt.organization_control_resolved).toBe(true);
    expect(receipt.saving_controls_settled).toBe(true);
    expect(receipt.next_dev_overlay_excluded_from_capture).toBe(true);
    expect(receipt.next_dev_portal_host_count_before_capture).toEqual(expect.any(Number));
    expect(receipt.captured_at).toEqual(expect.any(String));
    expect(receipt.network.responses).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                ok: expect.any(Boolean),
                path: expect.any(String),
                query_keys: expect.any(Array),
                status: expect.any(Number),
            }),
        ]),
    );
});

test("P0 direct setup exposes OAuth and both manual modes", async ({ page, request }, testInfo) => {
    const scenario: QaScenario = {
        id: "02-direct-setup-modes",
        priority: "P0",
        title: "Direct setup exposes OAuth, client credentials, and API token",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "not-connected");
    await resizeForScenario(page, scenario.viewport);
    const signals = collectBrowserSignals(page);
    await page.goto("/org/admin/integrations/pagerduty");
    await page.getByRole("button", { name: "Client credentials" }).click();
    await expect(page.getByLabel("Client ID")).toBeVisible();
    await page.getByRole("button", { name: "Use API token instead" }).click();
    await expect(page.getByLabel("API token")).toBeVisible();
    await captureScenario(page, testInfo, scenario, signals);
});

test("P0 OAuth callback succeeds once and removes callback query values", async ({
    page,
    request,
}, testInfo) => {
    const scenario: QaScenario = {
        id: "03-callback-success-sanitized-once",
        priority: "P0",
        title: "OAuth callback success is sanitized and completes exactly once",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "connected-us");
    await resizeForScenario(page, scenario.viewport);
    const signals = collectBrowserSignals(page);
    await page.goto("/org/admin/integrations/pagerduty/callback?state=mock-state&code=mock-code");
    await expect(
        page.getByText("PagerDuty is connected. You can now configure the datasets to sync."),
    ).toBeVisible();
    await expect
        .poll(async () => {
            const callbackUrl = new URL(page.url());
            const observations = await pagerDutyObservations(request);
            return {
                callbackCount: observations.callback_count,
                pathname: callbackUrl.pathname,
                search: callbackUrl.search,
            };
        })
        .toEqual({
            callbackCount: 1,
            pathname: "/org/admin/integrations/pagerduty/callback",
            search: "",
        });
    await captureScenario(page, testInfo, scenario, signals);
    const receipt = JSON.parse(
        await readFile(
            path.join(EVIDENCE_ROOT, `${scenario.id}-${scenario.viewport}.json`),
            "utf8",
        ),
    );
    expect(receipt.network.requests).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                path: "/org/admin/integrations/pagerduty/callback",
                query_keys: ["code", "state"],
            }),
        ]),
    );
    expect(JSON.stringify(receipt.network)).not.toContain("mock-code");
    expect(JSON.stringify(receipt.network)).not.toContain("mock-state");
});

test("P0 callback authorization error is visible after URL sanitization", async ({
    page,
    request,
}, testInfo) => {
    const scenario: QaScenario = {
        id: "04-callback-error-sanitized",
        priority: "P0",
        title: "OAuth callback error surfaces a usable recovery state",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "callback-error");
    await resizeForScenario(page, scenario.viewport);
    const signals = collectBrowserSignals(page);
    await page.goto(
        "/org/admin/integrations/pagerduty/callback?state=mock-state&error=access_denied",
    );
    await expect(page.getByText("Authorization was denied")).toBeVisible();
    await expect(page.locator('a[href="/org/admin/integrations/pagerduty"]')).toBeVisible();
    await captureScenario(page, testInfo, scenario, signals);
});

test("P0 incomplete callback preserves a focused error recovery state", async ({
    page,
    request,
}, testInfo) => {
    const scenario: QaScenario = {
        id: "05-callback-incomplete",
        priority: "P0",
        title: "Incomplete callback is an accessible recovery state",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "not-connected");
    await resizeForScenario(page, scenario.viewport);
    const signals = collectBrowserSignals(page);
    await page.goto("/org/admin/integrations/pagerduty/callback?state=mock-state");
    await expect(
        page.getByRole("alert").filter({
            hasText: "did not return a complete authorization response",
        }),
    ).toBeVisible();
    await captureScenario(page, testInfo, scenario, signals);
});

test("P0 EU client credentials persists then renders connected status", async ({
    page,
    request,
}, testInfo) => {
    const scenario: QaScenario = {
        id: "06-client-credentials-eu",
        priority: "P0",
        title: "EU client credentials saves through the real server-action boundary",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "connected-eu");
    await resizeForScenario(page, scenario.viewport);
    const signals = collectBrowserSignals(page);
    await page.goto("/org/admin/integrations/pagerduty");
    await page.getByLabel("Account subdomain").fill("eu-operations");
    await page.getByLabel("Region").selectOption("eu");
    await page.getByRole("button", { name: "Client credentials" }).click();
    await page.getByLabel("Client ID").fill("qa-client-id");
    await page.getByLabel("Client secret").fill("redacted");
    await page.getByRole("button", { name: "Create credential" }).click();
    const status = page.getByRole("status");
    await expect(status).toContainText("EU Operations");
    await expect(status.getByText("Client credentials", { exact: true })).toBeVisible();
    await expect(status.getByText("No scopes reported")).toBeVisible();
    await expect(status.getByText("No expiry reported")).toBeVisible();
    await expect(status.getByText("Refresh token unavailable")).toBeVisible();
    await expect(page.getByText("Refresh token available")).toHaveCount(0);
    await captureScenario(page, testInfo, scenario, signals);
});

test("P0 US API token persists and exposes connection controls", async ({
    page,
    request,
}, testInfo) => {
    const scenario: QaScenario = {
        id: "07-api-token-us",
        priority: "P0",
        title: "US API token setup exposes status, preflight, and disconnect",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "connected-us");
    await resizeForScenario(page, scenario.viewport);
    const signals = collectBrowserSignals(page);
    await page.goto("/org/admin/integrations/pagerduty");
    await page.getByLabel("Account subdomain").fill("operations");
    await page.getByRole("button", { name: "Use API token instead" }).click();
    await page.getByLabel("API token").fill("redacted");
    await page.getByRole("button", { name: "Create credential" }).click();
    const status = page.getByRole("status");
    await expect(status.getByText("API token", { exact: true })).toBeVisible();
    await expect(status.getByText("No scopes reported")).toBeVisible();
    await expect(status.getByText("No expiry reported")).toBeVisible();
    await expect(status.getByText("Refresh token unavailable")).toBeVisible();
    await expect(page.getByText("Refresh token available")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Run preflight" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();
    await captureScenario(page, testInfo, scenario, signals);
});

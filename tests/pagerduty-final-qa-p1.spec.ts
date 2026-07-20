import { expect, test } from "@playwright/test";
import {
    captureScenario,
    collectBrowserSignals,
    pagerDutyObservations,
    resizeForScenario,
    setPagerDutyScenario,
    type QaScenario,
} from "./pagerduty-final-qa.helpers";

test.describe.configure({ mode: "serial" });

async function openSetup(
    page: import("@playwright/test").Page,
    scenario: QaScenario,
): Promise<ReturnType<typeof collectBrowserSignals>> {
    await resizeForScenario(page, scenario.viewport);
    const signals = collectBrowserSignals(page);
    await page.goto("/org/admin/integrations/pagerduty");
    return signals;
}

test("P1 status shows the disconnected state", async ({ page, request }, testInfo) => {
    const scenario: QaScenario = {
        id: "08-status-not-connected",
        priority: "P1",
        title: "Status refresh renders the disconnected state",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "not-connected");
    const signals = await openSetup(page, scenario);
    await page.getByRole("button", { name: "Check connection status" }).click();
    await expect(page.getByRole("status")).toContainText("Not connected");
    await captureScenario(page, testInfo, scenario, signals);
});

test("P1 status failure keeps the setup form usable", async ({ page, request }, testInfo) => {
    const scenario: QaScenario = {
        id: "09-status-error",
        priority: "P1",
        title: "Status API failure is surfaced without losing setup controls",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "status-error");
    const signals = await openSetup(page, scenario);
    await page.getByRole("button", { name: "Check connection status" }).click();
    await expect(
        page.getByTestId("data-state-error").getByText("PagerDuty status is unavailable."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect PagerDuty" })).toBeVisible();
    await captureScenario(page, testInfo, scenario, signals);
});

test("P1 connected US status reports expiry and refresh availability", async ({
    page,
    request,
}, testInfo) => {
    const scenario: QaScenario = {
        id: "10-status-connected-us",
        priority: "P1",
        title: "Connected US status reports persisted expiry and refresh token",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "connected-us");
    const signals = await openSetup(page, scenario);
    await page.getByRole("button", { name: "Check connection status" }).click();
    await expect(page.getByRole("status")).toContainText("Operations");
    await expect(page.getByText("Refresh token available")).toBeVisible();
    await captureScenario(page, testInfo, scenario, signals);
});

test("P1 expired credentials show an explicit expiry warning", async ({
    page,
    request,
}, testInfo) => {
    const scenario: QaScenario = {
        id: "11-status-expired",
        priority: "P1",
        title: "Expired OAuth status stays distinguishable from disconnected",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "expired");
    const signals = await openSetup(page, scenario);
    await page.getByRole("button", { name: "Check connection status" }).click();
    await expect(page.getByText(/Expired/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Run preflight" })).toBeVisible();
    await captureScenario(page, testInfo, scenario, signals);
});

test("P1 partial preflight reports missing scopes per requested dataset", async ({
    page,
    request,
}, testInfo) => {
    const scenario: QaScenario = {
        id: "12-preflight-partial-missing",
        priority: "P1",
        title: "Preflight identifies partial missing dataset permissions",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "preflight-partial");
    const signals = await openSetup(page, scenario);
    await page.getByRole("button", { name: "Check connection status" }).click();
    await expect(page.getByText(/incidents\.read/)).toHaveCount(0);
    await page.getByRole("button", { name: "Run preflight" }).click();
    await expect(page.getByRole("heading", { name: "Permission checks" })).toBeVisible();
    await expect(page.getByText("Additional permissions needed")).toBeVisible();
    await expect(page.getByText("Missing scopes: incidents.read")).toBeVisible();
    await captureScenario(page, testInfo, scenario, signals);
});

test("P1 disconnect removes connected controls", async ({ page, request }, testInfo) => {
    const scenario: QaScenario = {
        id: "13-disconnect-success",
        priority: "P1",
        title: "Disconnect resets the current connection state",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "connected-us");
    const signals = await openSetup(page, scenario);
    await page.getByRole("button", { name: "Check connection status" }).click();
    await page.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByRole("button", { name: "Run preflight" })).toHaveCount(0);
    expect((await pagerDutyObservations(request)).calls.disconnect).toBe(1);
    await captureScenario(page, testInfo, scenario, signals);
});

test("P1 disconnect failure leaves the connection visible", async ({ page, request }, testInfo) => {
    const scenario: QaScenario = {
        id: "14-disconnect-error",
        priority: "P1",
        title: "Disconnect failure preserves the connected controls for recovery",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "disconnect-error");
    const signals = await openSetup(page, scenario);
    await page.getByRole("button", { name: "Check connection status" }).click();
    await page.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByTestId("data-state-error").getByText("Disconnect failed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Run preflight" })).toBeVisible();
    await captureScenario(page, testInfo, scenario, signals);
});

test("P1 rapid status rename ignores a late stale response", async ({
    page,
    request,
}, testInfo) => {
    const scenario: QaScenario = {
        id: "15-rapid-status-rename",
        priority: "P1",
        title: "Rapid credential rename ignores stale status responses",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "connected-us");
    const signals = await openSetup(page, scenario);
    const credentialName = page.getByRole("textbox", { name: "Credential name" });
    await credentialName.fill("slow");
    await page.getByRole("button", { name: "Check connection status" }).click();
    await credentialName.fill("fast");
    await page.getByRole("button", { name: "Check connection status" }).click();
    await expect(page.getByRole("status")).toContainText("Operations");
    await expect
        .poll(async () => (await pagerDutyObservations(request)).calls["status-response"])
        .toBe(2);
    await expect(page.getByRole("status")).not.toContainText("slow");
    await captureScenario(page, testInfo, scenario, signals);
});

import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
    NEXT_DEV_OVERLAY_CAPTURE_STYLE,
    setPagerDutyEntitlement,
    setPagerDutyScenario,
    waitForCaptureReadiness,
} from "./pagerduty-final-qa.helpers";

const ARTIFACT_ROOT = path.resolve(".omo/start-work/artifacts/chaos-3024/task-1/web-gate");

function collectConsole(page: Page): readonly string[] {
    const messages: string[] = [];
    page.on("console", (message) => messages.push(`${message.type()}: ${message.text()}`));
    return messages;
}

async function captureArtifact(
    page: Page,
    name: string,
    consoleMessages: readonly string[],
): Promise<void> {
    await mkdir(ARTIFACT_ROOT, { recursive: true });
    await page.screenshot({
        path: path.join(ARTIFACT_ROOT, `${name}.png`),
        fullPage: true,
        style: NEXT_DEV_OVERLAY_CAPTURE_STYLE,
    });
    await writeFile(
        path.join(ARTIFACT_ROOT, `${name}.console.json`),
        `${JSON.stringify({ console: consoleMessages }, null, 2)}\n`,
    );
}

test.describe.configure({ mode: "serial" });

test("P3 hides PagerDuty creation controls when an older Ops response omits the entitlement", async ({
    page,
    request,
}) => {
    await setPagerDutyScenario(request, "not-connected");
    await setPagerDutyEntitlement(request, "canonical-absent");
    await page.setViewportSize({ width: 375, height: 844 });
    const consoleMessages = collectConsole(page);

    await page.goto("/org/admin/integrations");
    await expect(page.getByRole("button", { name: "Add Provider" })).toBeVisible();
    await page.getByRole("button", { name: "Add Provider" }).click();
    await expect(page.getByRole("link", { name: "PagerDuty" })).toHaveCount(0);
    await waitForCaptureReadiness(page, "mobile");
    await captureArtifact(page, "off-no-credentials-375", consoleMessages);
});

test("P3 keeps a pre-existing PagerDuty connection manageable when the entitlement is false", async ({
    page,
    request,
}) => {
    await setPagerDutyScenario(request, "mapping-fixture");
    await setPagerDutyEntitlement(request, "canonical-disabled");
    await page.setViewportSize({ width: 768, height: 1024 });
    const consoleMessages = collectConsole(page);

    await page.goto("/org/admin/integrations/pagerduty");
    const credentialsRegion = page.getByRole("region", { name: "PagerDuty credentials" });
    await expect(credentialsRegion.getByRole("table")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add credential" })).toHaveCount(0);
    await expect(credentialsRegion.getByRole("button", { name: "Test" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create sync configuration" })).toHaveCount(0);
    await waitForCaptureReadiness(page, "responsive");
    await captureArtifact(page, "off-existing-manage-only-768", consoleMessages);
});

test("P3 exposes PagerDuty creation only when the entitlement is explicitly true", async ({
    page,
    request,
}) => {
    await setPagerDutyScenario(request, "not-connected");
    await setPagerDutyEntitlement(request, "canonical-enabled");
    await page.setViewportSize({ width: 1280, height: 900 });
    const consoleMessages = collectConsole(page);

    await page.goto("/org/admin/integrations/pagerduty");
    await expect(page.getByRole("heading", { name: "Auth method" })).toBeVisible();
    await expect(page.getByRole("button", { name: "OAuth (recommended)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Client credentials" })).toBeVisible();
    await waitForCaptureReadiness(page, "desktop");
    await captureArtifact(page, "on-create-path-1280", consoleMessages);
});

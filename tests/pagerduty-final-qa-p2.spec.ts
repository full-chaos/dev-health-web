import { expect, test } from "@playwright/test";
import {
    captureScenario,
    collectBrowserSignals,
    pagerDutyObservations,
    PAGERDUTY_SYNC_CONFIG_EDIT_PATH,
    resizeForScenario,
    settleToastAnimations,
    setPagerDutyScenario,
    type QaScenario,
} from "./pagerduty-final-qa.helpers";

test.describe.configure({ mode: "serial" });

async function openMappingEditor(
    page: import("@playwright/test").Page,
    request: import("@playwright/test").APIRequestContext,
    scenario: QaScenario,
) {
    await setPagerDutyScenario(request, "mapping-fixture");
    await resizeForScenario(page, scenario.viewport);
    const signals = collectBrowserSignals(page);
    await page.goto(PAGERDUTY_SYNC_CONFIG_EDIT_PATH);
    await expect(page.getByText("Service repository mappings")).toBeVisible();
    await expect(
        page.getByRole("group", { name: "Service mapping 1" }).getByLabel("PagerDuty service"),
    ).toHaveValue("service-api");
    await expect(page.getByLabel("Repository provider 1.1")).toHaveValue("github");
    await expect(page.getByLabel("Repository full name 1.1")).toHaveValue("chaos/api");
    await expect(page.getByLabel("Repository provider 1.2")).toHaveValue("gitlab");
    await expect(page.getByLabel("Repository full name 1.2")).toHaveValue("chaos/api-mirror");
    return signals;
}

test("P1 mapping editor supports multiple repository targets", async ({
    page,
    request,
}, testInfo) => {
    const scenario: QaScenario = {
        id: "16-mapping-add-repository",
        priority: "P1",
        title: "Mapping editor supports multiple repository targets",
        viewport: "desktop",
    };
    const signals = await openMappingEditor(page, request, scenario);
    await page.getByRole("button", { name: "Add repository target for service mapping 1" }).click();
    await page.getByLabel("Repository provider 1.3").fill("github");
    await page.getByLabel("Repository full name 1.3").fill("chaos/api-docs");
    await expect(page.getByLabel("Repository full name 1.3")).toHaveValue("chaos/api-docs");
    await captureScenario(page, testInfo, scenario, signals);
});

test("P1 duplicate PagerDuty services retain both rows with an accessible error", async ({
    page,
    request,
}, testInfo) => {
    const scenario: QaScenario = {
        id: "17-mapping-duplicate-service",
        priority: "P1",
        title: "Duplicate PagerDuty service IDs are blocked accessibly",
        viewport: "desktop",
    };
    const signals = await openMappingEditor(page, request, scenario);
    await page.getByRole("button", { name: "Add service mapping" }).click();
    await page
        .getByRole("group", { name: "Service mapping 2" })
        .getByLabel("PagerDuty service")
        .selectOption("service-api");
    await expect(page.locator("#pagerduty-service-repository-mappings-error")).toBeVisible();
    await expect(
        page.getByRole("group", { name: "Service mapping 1" }).getByLabel("PagerDuty service"),
    ).toHaveValue("service-api");
    await expect(
        page.getByRole("group", { name: "Service mapping 2" }).getByLabel("PagerDuty service"),
    ).toHaveValue("service-api");
    await captureScenario(page, testInfo, scenario, signals);
});

test("P1 mapping remove target identifies the required-target failure", async ({
    page,
    request,
}, testInfo) => {
    const scenario: QaScenario = {
        id: "18-mapping-remove-target",
        priority: "P1",
        title: "Removing the final target displays the required mapping error",
        viewport: "desktop",
    };
    const signals = await openMappingEditor(page, request, scenario);
    await page.getByRole("button", { name: "Remove repository target 1.1" }).click();
    await expect(page.getByLabel("Repository full name 1.1")).toHaveValue("chaos/api-mirror");
    await page.getByRole("button", { name: "Remove repository target 1.1" }).click();
    await expect(
        page.getByText("Each PagerDuty service needs at least one repository target."),
    ).toBeVisible();
    await captureScenario(page, testInfo, scenario, signals);
});

test("P1 save preserves non-admin mapping namespaces", async ({ page, request }, testInfo) => {
    const scenario: QaScenario = {
        id: "19-mapping-save-namespace-preservation",
        priority: "P1",
        title: "Saving admin mappings preserves imported mapping namespace",
        viewport: "desktop",
    };
    const signals = await openMappingEditor(page, request, scenario);
    await page.getByRole("button", { name: "Add repository target for service mapping 1" }).click();
    await page.getByLabel("Repository full name 1.3").fill("chaos/api-docs");
    await page.getByRole("button", { name: "Update configuration" }).click();
    await expect(page.getByText("Config updated")).toBeVisible();
    const toastTokenUse = await page.getByText("Config updated").evaluate(async (title) => {
        const toast = title.closest("[data-sonner-toast]");
        const toaster = document.querySelector("[data-sonner-toaster]");
        if (!(toast instanceof HTMLElement) || !(toaster instanceof HTMLElement)) return null;
        const root = document.documentElement;
        const originalTheme = root.getAttribute("data-theme");
        const resolve = (
            styleProperty: "background" | "borderColor" | "color",
            computedProperty: "backgroundColor" | "borderTopColor" | "color",
            token: string,
        ) => {
            const reference = document.createElement("div");
            reference.style[styleProperty] = token;
            toaster.append(reference);
            const value = window.getComputedStyle(reference)[computedProperty];
            reference.remove();
            return value;
        };
        try {
            const tokenUse = [];
            for (const theme of ["light", "dark"]) {
                root.setAttribute("data-theme", theme);
                await new Promise<void>((resolveFrame) => {
                    window.requestAnimationFrame(() => resolveFrame());
                });
                const toastStyle = window.getComputedStyle(toast);
                const titleStyle = window.getComputedStyle(title);
                tokenUse.push({
                    backgroundMatchesSurface:
                        toastStyle.backgroundColor ===
                        resolve("background", "backgroundColor", "var(--toast-surface)"),
                    borderMatchesStatus:
                        toastStyle.borderTopColor ===
                        resolve("borderColor", "borderTopColor", "var(--success-border)"),
                    titleMatchesToken:
                        titleStyle.color === resolve("color", "color", "var(--toast-title)"),
                });
            }
            return tokenUse;
        } finally {
            if (originalTheme === null) root.removeAttribute("data-theme");
            else root.setAttribute("data-theme", originalTheme);
        }
    });
    expect(toastTokenUse).toEqual([
        { backgroundMatchesSurface: true, borderMatchesStatus: true, titleMatchesToken: true },
        { backgroundMatchesSurface: true, borderMatchesStatus: true, titleMatchesToken: true },
    ]);
    const documentRoot = page.locator("html");
    const originalTheme = await documentRoot.getAttribute("data-theme");
    await documentRoot.evaluate((root) => root.setAttribute("data-theme", "light"));
    await settleToastAnimations(page);
    const lightToastPath = testInfo.outputPath("light-theme-success-toast.png");
    await page.screenshot({ path: lightToastPath, fullPage: true });
    await testInfo.attach("light-theme-success-toast", {
        path: lightToastPath,
        contentType: "image/png",
    });
    if (originalTheme === null)
        await documentRoot.evaluate((root) => root.removeAttribute("data-theme"));
    else
        await documentRoot.evaluate(
            (root, theme) => root.setAttribute("data-theme", theme),
            originalTheme,
        );
    const observations = await pagerDutyObservations(request);
    expect(JSON.stringify(observations.last_sync_options)).toContain("imported");
    expect(JSON.stringify(observations.last_sync_options)).toContain("chaos/api-docs");
    const capture = await captureScenario(page, testInfo, scenario, signals);
    expect(capture.toastAnimationsSettled).toBe(true);
});

test("P1 toast styles map Sonner status properties to semantic tokens", async ({ page }) => {
    await page.goto("/org/admin/integrations/pagerduty");

    const toastStyles = await page.evaluate(() => {
        const rules = Array.from(document.styleSheets).flatMap((sheet) => {
            try {
                return Array.from(sheet.cssRules);
            } catch {
                return [];
            }
        });
        const declarationFor = (selector: string) => {
            const rule = rules.find(
                (candidate): candidate is CSSStyleRule =>
                    candidate instanceof CSSStyleRule && candidate.selectorText === selector,
            );
            return rule
                ? {
                      background: rule.style.getPropertyValue("background"),
                      borderColor: rule.style.getPropertyValue("border-color"),
                      color: rule.style.getPropertyValue("color"),
                      normalBackground: rule.style.getPropertyValue("--normal-bg"),
                      normalBorder: rule.style.getPropertyValue("--normal-border"),
                      normalText: rule.style.getPropertyValue("--normal-text"),
                      successBackground: rule.style.getPropertyValue("--success-bg"),
                      successBorder: rule.style.getPropertyValue("--success-border"),
                  }
                : null;
        };
        return {
            toaster: declarationFor("html [data-sonner-toaster][data-sonner-theme]"),
            title: declarationFor(
                '[data-sonner-toaster] [data-sonner-toast][data-styled="true"] [data-title]',
            ),
            description: declarationFor(
                '[data-sonner-toaster] [data-sonner-toast][data-styled="true"] [data-description]',
            ),
            statusIcon: declarationFor(
                "[data-sonner-toaster] [data-sonner-toast][data-type] [data-icon]",
            ),
        };
    });

    expect(toastStyles.toaster).toMatchObject({
        normalBackground: "var(--toast-surface)",
        normalBorder: "var(--toast-border)",
        normalText: "var(--toast-title)",
        successBackground: "var(--toast-surface)",
    });
    expect(toastStyles.title).toMatchObject({ color: "var(--toast-title)" });
    expect(toastStyles.description).toMatchObject({ color: "var(--toast-description)" });
    expect(toastStyles.statusIcon).toMatchObject({ color: "var(--toast-status-icon)" });
});

test("P1 accent controls meet WCAG AA contrast across every palette", async ({ page }) => {
    await page.goto("/org/admin/integrations/pagerduty");
    const palettes = [
        "material",
        "echarts",
        "fullchaos",
        "fullchaos-cosmic-train",
        "fullchaos-infinity-knot",
        "fullchaos-infinity-knot-redux",
        "fullchaos-cosmic-nebula",
        "flat",
    ];

    for (const palette of palettes) {
        for (const theme of ["light", "dark"]) {
            const colors = await page.evaluate(
                ({ paletteName, themeName }) => {
                    document.documentElement.dataset.palette = paletteName;
                    document.documentElement.dataset.theme = themeName;
                    const probe = document.createElement("div");
                    probe.style.backgroundColor = "var(--accent)";
                    probe.style.color = "var(--accent-foreground)";
                    document.body.append(probe);
                    const styles = getComputedStyle(probe);
                    const parse = (value: string) => {
                        const channels =
                            value
                                .match(/[\d.]+/g)
                                ?.slice(0, 3)
                                .map(Number) ?? [];
                        return channels.map((channel) => {
                            const normalized = channel / 255;
                            return normalized <= 0.04045
                                ? normalized / 12.92
                                : ((normalized + 0.055) / 1.055) ** 2.4;
                        });
                    };
                    const luminance = (channels: number[]) =>
                        0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
                    const accentColor = styles.backgroundColor;
                    const foregroundColor = styles.color;
                    const accent = luminance(parse(accentColor));
                    const foreground = luminance(parse(foregroundColor));
                    probe.remove();
                    return {
                        accentColor,
                        foregroundColor,
                        contrast:
                            (Math.max(accent, foreground) + 0.05) /
                            (Math.min(accent, foreground) + 0.05),
                    };
                },
                { paletteName: palette, themeName: theme },
            );
            expect(
                colors.contrast,
                `${palette} ${theme}: ${colors.accentColor} / ${colors.foregroundColor}`,
            ).toBeGreaterThanOrEqual(4.5);
        }
    }
});

test("P1 create wizard blocks duplicate PagerDuty services on the mapping step", async ({
    page,
    request,
}, testInfo) => {
    await setPagerDutyScenario(request, "mapping-fixture");
    await resizeForScenario(page, "desktop");
    await page.goto("/org/admin/sync/new");
    await page.getByLabel("Configuration Name").fill("PagerDuty duplicate QA Sync");
    await page.getByLabel("Provider").selectOption("pagerduty");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Credential").selectOption("cred-pagerduty-1");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("PagerDuty operational data").check();
    await page.getByRole("button", { name: "Add service mapping" }).click();
    await page
        .getByRole("group", { name: "Service mapping 1" })
        .getByLabel("PagerDuty service")
        .selectOption("service-api");
    await page.getByLabel("Repository full name 1.1").fill("chaos/api");
    await page.getByRole("button", { name: "Add service mapping" }).click();
    await page
        .getByRole("group", { name: "Service mapping 2" })
        .getByLabel("PagerDuty service")
        .selectOption("service-api");
    await page.getByLabel("Repository full name 2.1").fill("chaos/api-mirror");

    const mappingEditor = page.locator("#pagerduty-service-repository-mappings");
    await expect(page.locator("#pagerduty-service-repository-mappings-error")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
    await mappingEditor.focus();
    await expect(mappingEditor).toBeFocused();
    await expect(page.getByRole("button", { name: "Create Configuration" })).toHaveCount(0);

    const screenshotPath = testInfo.outputPath("duplicate-mapping-stays-on-step.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach("duplicate-mapping-stays-on-step", {
        path: screenshotPath,
        contentType: "image/png",
    });
});

test("P1 create wizard carries mappings into ReviewStep", async ({ page, request }, testInfo) => {
    const scenario: QaScenario = {
        id: "20-create-review-step-mappings",
        priority: "P1",
        title: "New PagerDuty sync wizard summarizes mappings before create",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "mapping-fixture");
    await resizeForScenario(page, scenario.viewport);
    const signals = collectBrowserSignals(page);
    await page.goto("/org/admin/sync/new");
    await expect(page.getByRole("button", { name: "1. Provider" })).toHaveAttribute(
        "aria-current",
        "step",
    );
    await page.getByLabel("Configuration Name").fill("PagerDuty QA Sync");
    await page.getByLabel("Provider").selectOption("pagerduty");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("button", { name: "2. Credential" })).toHaveAttribute(
        "aria-current",
        "step",
    );
    await page.getByLabel("Credential").selectOption("cred-pagerduty-1");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("button", { name: "3. Datasets" })).toHaveAttribute(
        "aria-current",
        "step",
    );
    await page.getByLabel("PagerDuty operational data").check();
    await page.getByRole("button", { name: "Add service mapping" }).click();
    await page
        .getByRole("group", { name: "Service mapping 1" })
        .getByLabel("PagerDuty service")
        .selectOption("service-api");
    await page.getByLabel("Repository full name 1.1").fill("chaos/api");
    await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("button", { name: "4. Depth & schedule" })).toHaveAttribute(
        "aria-current",
        "step",
    );
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("button", { name: "5. Review" })).toHaveAttribute(
        "aria-current",
        "step",
    );
    await expect(page.getByRole("button", { name: "3. Datasets" })).not.toHaveAttribute(
        "aria-current",
        "step",
    );
    await expect(page.getByText("Service repository mappings")).toBeVisible();
    await expect(page.getByText("API service: github:chaos/api")).toBeVisible();
    await captureScenario(page, testInfo, scenario, signals);
});

test("P2 mobile PagerDuty credentials use generic row actions", async ({
    page,
    request,
}, testInfo) => {
    const scenario: QaScenario = {
        id: "21-mobile-generic-credential-row-actions",
        priority: "P2",
        title: "Mobile PagerDuty credentials use generic row actions",
        viewport: "mobile",
    };
    await setPagerDutyScenario(request, "mapping-fixture");
    await resizeForScenario(page, scenario.viewport);
    const signals = collectBrowserSignals(page);
    await page.goto("/org/admin/integrations/pagerduty");
    const credentialsRegion = page.getByRole("region", { name: "PagerDuty credentials" });
    await expect(credentialsRegion.getByRole("table")).toBeVisible();
    await expect(credentialsRegion.getByRole("button", { name: "Manage" })).toBeVisible();
    await expect(credentialsRegion.getByRole("button", { name: "Test" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check connection status" })).toHaveCount(0);
    await captureScenario(page, testInfo, scenario, signals);
});

test("P2 mobile mapping keeps add and remove affordances visible", async ({
    page,
    request,
}, testInfo) => {
    const scenario: QaScenario = {
        id: "22-mobile-mapping-controls",
        priority: "P2",
        title: "Mobile mapping editor retains multi-target controls",
        viewport: "mobile",
    };
    const signals = await openMappingEditor(page, request, scenario);
    await expect(
        page.getByRole("button", { name: "Add repository target for service mapping 1" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove repository target 1.1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove repository target 1.2" })).toBeVisible();
    const labelAndButtonOverlap = await page
        .locator("fieldset")
        .first()
        .evaluate((mapping) => {
            const label = mapping.querySelector('label[for^="pagerduty-service-"]');
            const button = mapping.querySelector('[aria-label="Remove service mapping 1"]');
            if (!(label instanceof HTMLElement) || !(button instanceof HTMLElement)) return null;
            const labelBox = label.getBoundingClientRect();
            const buttonBox = button.getBoundingClientRect();
            return !(
                labelBox.right <= buttonBox.left ||
                buttonBox.right <= labelBox.left ||
                labelBox.bottom <= buttonBox.top ||
                buttonBox.bottom <= labelBox.top
            );
        });
    expect(labelAndButtonOverlap).toBe(false);
    await captureScenario(page, testInfo, scenario, signals);
});

test("P1 unresolved persisted mapping can be replaced without exposing its external ID", async ({
    page,
    request,
}, testInfo) => {
    const scenario: QaScenario = {
        id: "23-unresolved-mapping-replacement",
        priority: "P1",
        title: "Unresolved persisted PagerDuty service can be replaced safely",
        viewport: "desktop",
    };
    await setPagerDutyScenario(request, "mapping-unresolved");
    await resizeForScenario(page, scenario.viewport);
    const signals = collectBrowserSignals(page);
    await page.goto(PAGERDUTY_SYNC_CONFIG_EDIT_PATH);
    await expect(page.getByText("Service repository mappings")).toBeVisible();
    const service = page
        .getByRole("group", { name: "Service mapping 1" })
        .getByLabel("PagerDuty service");
    await expect(service).toHaveValue("service-unavailable");
    await expect(page.getByText("Unresolved")).toBeVisible();
    await expect(page.getByText("service-unavailable", { exact: true })).toHaveCount(0);

    await service.selectOption("service-api");
    await expect(service).toHaveValue("service-api");
    await expect(page.getByText("Unresolved")).toHaveCount(0);
    await page.getByRole("button", { name: "Update Configuration" }).click();
    await expect(page.getByText("Config updated")).toBeVisible();
    const observations = await pagerDutyObservations(request);
    expect(JSON.stringify(observations.last_sync_options)).toContain("service-api");
    expect(JSON.stringify(observations.last_sync_options)).not.toContain("service-unavailable");
    await captureScenario(page, testInfo, scenario, signals);
});

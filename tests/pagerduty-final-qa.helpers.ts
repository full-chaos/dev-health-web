import { expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { scrubTelemetryText } from "@/lib/sentry/scrubber-value";

export const EVIDENCE_ROOT = path.resolve(".qa-evidence/pagerduty-final-postremediation");
export const PAGERDUTY_SYNC_CONFIG_EDIT_PATH = "/org/admin/sync/sync-config-pagerduty-1/edit";
const MOCK_ORIGIN = process.env.PAGERDUTY_QA_MOCK_ORIGIN ?? "http://127.0.0.1:8001";
const NEXT_DEV_OVERLAY_CAPTURE_STYLE = "nextjs-portal { display: none !important; }";

export type QaScenario = {
    readonly id: string;
    readonly priority: "P0" | "P1" | "P2";
    readonly title: string;
    readonly viewport: "desktop" | "mobile";
};

type BrowserSignals = {
    readonly console: string[];
    readonly nonOkResponses: BrowserResponse[];
    readonly requestfailed: BrowserRequest[];
    readonly requests: BrowserRequest[];
    readonly responses: BrowserResponse[];
};

type BrowserRequest = {
    readonly method: string;
    readonly path: string;
    readonly query_keys: readonly string[];
};

type BrowserResponse = BrowserRequest & {
    readonly ok: boolean;
    readonly status: number;
};

type MobileLayoutMetrics = {
    readonly documentElementScrollWidth: number;
    readonly bodyScrollWidth: number;
    readonly viewportWidth: number;
    readonly clientWidth: number;
    readonly horizontalOverflow: boolean;
};

type PagerDutyObservations = {
    readonly callback_count: number;
    readonly calls: Readonly<Record<string, number>>;
    readonly last_sync_options: Record<string, unknown> | null;
};

type CaptureResult = {
    readonly toastAnimationsSettled: true;
    readonly awaitedToastAnimationCount: number;
    readonly toastOverlapsInteractiveControl: false;
};

type CaptureReadiness = {
    readonly authenticatedShellReady: true;
    readonly accountControlResolved: true;
    readonly organizationControlResolved: true;
    readonly savingControlsSettled: true;
    readonly nextDevOverlayExcludedFromCapture: true;
};

export async function resetEvidence(): Promise<void> {
    await rm(EVIDENCE_ROOT, { recursive: true, force: true });
    await mkdir(EVIDENCE_ROOT, { recursive: true });
}

export async function setPagerDutyScenario(
    request: APIRequestContext,
    scenario: string,
): Promise<void> {
    const response = await request.post(`${MOCK_ORIGIN}/__test/pagerduty`, { data: { scenario } });
    expect(response.status()).toBe(204);
}

export async function pagerDutyObservations(
    request: APIRequestContext,
): Promise<PagerDutyObservations> {
    const response = await request.get(`${MOCK_ORIGIN}/__test/pagerduty/observations`);
    expect(response.ok()).toBeTruthy();
    return response.json() as Promise<PagerDutyObservations>;
}

export async function resizeForScenario(
    page: Page,
    viewport: QaScenario["viewport"],
): Promise<void> {
    await page.setViewportSize(
        viewport === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 },
    );
}

export function collectBrowserSignals(page: Page): BrowserSignals {
    const console: string[] = [];
    const requests: BrowserRequest[] = [];
    const responses: BrowserResponse[] = [];
    const nonOkResponses: BrowserResponse[] = [];
    const requestfailed: BrowserRequest[] = [];
    page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
            console.push(scrubTelemetryText(`${message.type()}: ${message.text()}`));
        }
    });
    page.on("request", (request) => {
        if (isEvidenceRequest(request.url())) requests.push(sanitizeRequest(request));
    });
    page.on("response", (response) => {
        const request = response.request();
        if (!isEvidenceRequest(request.url())) return;
        const receipt = {
            ...sanitizeRequest(request),
            ok: response.ok(),
            status: response.status(),
        };
        responses.push(receipt);
        if (!receipt.ok) nonOkResponses.push(receipt);
    });
    page.on("requestfailed", (request) => {
        if (isEvidenceRequest(request.url())) requestfailed.push(sanitizeRequest(request));
    });
    return { console, nonOkResponses, requestfailed, requests, responses };
}

function isEvidenceRequest(url: string): boolean {
    const path = new URL(url).pathname;
    return path.includes("/org/admin/") || path.includes("/api/");
}

function sanitizeRequest(request: {
    readonly method: () => string;
    readonly url: () => string;
}): BrowserRequest {
    const url = new URL(request.url());
    return {
        method: request.method(),
        path: url.pathname,
        query_keys: [...url.searchParams.keys()].sort(),
    };
}

async function mobileLayoutMetrics(page: Page): Promise<MobileLayoutMetrics> {
    return page.evaluate(() => {
        const { body, documentElement } = document;
        const viewportWidth = window.innerWidth;
        const clientWidth = documentElement.clientWidth;
        const documentElementScrollWidth = documentElement.scrollWidth;
        const bodyScrollWidth = body.scrollWidth;
        return {
            documentElementScrollWidth,
            bodyScrollWidth,
            viewportWidth,
            clientWidth,
            horizontalOverflow:
                documentElementScrollWidth > viewportWidth || bodyScrollWidth > clientWidth,
        };
    });
}

export async function settleToastAnimations(page: Page): Promise<number> {
    return page.evaluate(async () => {
        const toaster = document.querySelector("[data-sonner-toaster]");
        if (!(toaster instanceof HTMLElement)) return 0;
        const animations = toaster.getAnimations({ subtree: true }).filter((animation) => {
            const iterations = animation.effect?.getTiming().iterations;
            return animation.playState !== "finished" && iterations !== Infinity;
        });
        await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
        return animations.length;
    });
}

async function toastOverlappingInteractiveControls(page: Page) {
    return page.evaluate(() => {
        const toast = document.querySelector('[data-sonner-toast][data-visible="true"]');
        if (!(toast instanceof HTMLElement)) return [];
        const toastRect = toast.getBoundingClientRect();
        const controls = document.querySelectorAll<HTMLElement>(
            'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
        );
        return Array.from(controls)
            .filter((control) => {
                if (toast.contains(control)) return false;
                const style = window.getComputedStyle(control);
                if (style.display === "none" || style.visibility === "hidden") return false;
                const rect = control.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return false;
                return (
                    toastRect.left < rect.right &&
                    toastRect.right > rect.left &&
                    toastRect.top < rect.bottom &&
                    toastRect.bottom > rect.top
                );
            })
            .map((control) => {
                const rect = control.getBoundingClientRect();
                return {
                    control:
                        control.getAttribute("aria-label") ??
                        control.textContent?.trim() ??
                        control.tagName,
                    controlRect: {
                        top: rect.top,
                        right: rect.right,
                        bottom: rect.bottom,
                        left: rect.left,
                    },
                    toastRect: {
                        top: toastRect.top,
                        right: toastRect.right,
                        bottom: toastRect.bottom,
                        left: toastRect.left,
                    },
                };
            });
    });
}

async function waitForCaptureReadiness(
    page: Page,
    viewport: QaScenario["viewport"],
): Promise<CaptureReadiness> {
    const accountControl = page.getByRole("button", { name: "Account options" });
    await expect(accountControl).toBeVisible();
    await expect(accountControl).toContainText("Account");

    const organizationControl = page.locator("#org-switcher");
    if (viewport === "desktop") {
        await expect(organizationControl).toBeVisible();
    } else {
        await expect(organizationControl).toBeAttached();
    }
    await expect(organizationControl).toHaveValue(/.+/);

    const saving = page.getByText("Saving…", { exact: true });
    if ((await saving.count()) > 0) await expect(saving).toBeHidden();
    const pendingActionNames = [
        "Connect PagerDuty",
        "Create credential",
        "Check connection status",
        "Run preflight",
        "Disconnect",
        "Update Configuration",
        "Create Configuration",
    ];
    for (const name of pendingActionNames) {
        const action = page.getByRole("button", { name, exact: true });
        if ((await action.count()) > 0) await expect(action).toBeEnabled();
    }
    return {
        authenticatedShellReady: true,
        accountControlResolved: true,
        organizationControlResolved: true,
        savingControlsSettled: true,
        nextDevOverlayExcludedFromCapture: true,
    };
}

export async function captureScenario(
    page: Page,
    _testInfo: TestInfo,
    scenario: QaScenario,
    signals: BrowserSignals,
): Promise<CaptureResult> {
    const fileName = `${scenario.id}-${scenario.viewport}.png`;
    const screenshotPath = path.join(EVIDENCE_ROOT, fileName);
    const readiness = await waitForCaptureReadiness(page, scenario.viewport);
    const awaitedToastAnimationCount = await settleToastAnimations(page);
    const visibleToasts = page.locator('[data-sonner-toast][data-visible="true"]');
    if ((await visibleToasts.count()) > 0) {
        await expect(visibleToasts).toHaveCount(0, { timeout: 10_000 });
    }
    const overlappingControls = await toastOverlappingInteractiveControls(page);
    expect(overlappingControls, JSON.stringify(overlappingControls)).toEqual([]);
    const nextDevPortalHostCount = await page.locator("nextjs-portal").count();
    await page.screenshot({
        path: screenshotPath,
        fullPage: true,
        style: NEXT_DEV_OVERLAY_CAPTURE_STYLE,
    });
    const capturedAt = new Date().toISOString();
    const layout = scenario.viewport === "mobile" ? await mobileLayoutMetrics(page) : undefined;
    if (layout) {
        expect(layout.horizontalOverflow).toBe(false);
    }
    expect(signals.nonOkResponses).toEqual([]);
    expect(signals.requestfailed).toEqual([]);
    await writeFile(
        path.join(EVIDENCE_ROOT, `${scenario.id}-${scenario.viewport}.json`),
        JSON.stringify(
            {
                id: scenario.id,
                priority: scenario.priority,
                title: scenario.title,
                viewport: scenario.viewport,
                url: new URL(page.url()).pathname,
                query_keys: [...new URL(page.url()).searchParams.keys()],
                screenshot: fileName,
                captured_at: capturedAt,
                console: signals.console,
                network: {
                    non_ok_responses: signals.nonOkResponses,
                    requestfailed: signals.requestfailed,
                    requests: signals.requests,
                    responses: signals.responses,
                },
                toast_animations_settled: true,
                awaited_toast_animation_count: awaitedToastAnimationCount,
                toast_overlaps_interactive_control: overlappingControls.length > 0,
                authenticated_shell_ready: readiness.authenticatedShellReady,
                account_control_resolved: readiness.accountControlResolved,
                organization_control_resolved: readiness.organizationControlResolved,
                saving_controls_settled: readiness.savingControlsSettled,
                next_dev_overlay_excluded_from_capture: readiness.nextDevOverlayExcludedFromCapture,
                next_dev_portal_host_count_before_capture: nextDevPortalHostCount,
                capture_status: "captured",
                ...(layout ?? {}),
            },
            null,
            2,
        ),
    );
    return {
        toastAnimationsSettled: true,
        awaitedToastAnimationCount,
        toastOverlapsInteractiveControl: false,
    };
}

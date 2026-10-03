import { expect, type Page } from "@playwright/test";

/**
 * CHAOS-8538: the check behind the app-shell logo canary.
 *
 * On 2026-10-03 the Next dev server stopped answering the request for the
 * app-shell logo in two CI jobs. The browser `load` event then never fired on
 * a signed-in page, and each test that waits for `load` ran into its 30 s
 * timeout, for 35 minutes. This check fails in `timeoutMs` and names the URL.
 */
export const SHELL_LOGO_ALT = "Full Chaos Dev Health logo";
export const SHELL_LOGO_TIMEOUT_MS = 10_000;

const POLL_INTERVAL_MS = 100;

type LogoState = { url: string; complete: boolean; naturalWidth: number };

function seconds(ms: number): string {
    return `${ms / 1000} s`;
}

/**
 * Passes when the first app-shell logo image of the current page is loaded.
 * Returns the URL the browser used for it.
 *
 * The caller must navigate with `waitUntil: "domcontentloaded"` (or
 * "commit"): the default `load` wait is the wait that a logo request with no
 * response never completes.
 */
export async function expectShellLogoAnswered(
    page: Page,
    timeoutMs: number = SHELL_LOGO_TIMEOUT_MS,
): Promise<string> {
    const logo = page.locator(`img[alt="${SHELL_LOGO_ALT}"]`).first();
    await expect(logo, "the app shell has no logo image; the canary cannot measure").toBeAttached({
        timeout: 15_000,
    });

    // The locator is resolved again on each read, so a re-rendered image is
    // still measured. `complete` is false only while the request is open.
    const read = (): Promise<LogoState> =>
        logo.evaluate((image: HTMLImageElement) => ({
            url: image.currentSrc || image.src,
            complete: image.complete,
            naturalWidth: image.naturalWidth,
        }));

    const deadline = Date.now() + timeoutMs;
    let state = await read();
    while (!state.complete && Date.now() < deadline) {
        await page.waitForTimeout(POLL_INTERVAL_MS);
        state = await read();
    }

    // The deadline is not a pass: a request that is still open fails here.
    const outcome = !state.complete ? "pending" : state.naturalWidth > 0 ? "loaded" : "broken";
    const message =
        outcome === "pending"
            ? `The app-shell logo request had no response after ${seconds(timeoutMs)}: GET ${state.url}\n` +
              "The web server does not answer this URL (CHAOS-8538). The browser `load` event cannot fire on a signed-in page, " +
              "so each test that waits for `load` there would run into its timeout. " +
              'See the [WebServer] lines and the "PENDING at timeout" blocks in this log.'
            : `The app-shell logo request was answered, but the response is not an image the browser can show: GET ${state.url}`;
    expect(outcome, message).toBe("loaded");
    return state.url;
}

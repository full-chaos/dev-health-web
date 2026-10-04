import { expect, type Page, type Request } from "@playwright/test";

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

type LogoState = {
    complete: boolean;
    naturalWidth: number;
    /** Empty in Chromium while the request is open: it cannot name the open request. */
    currentSrc: string;
    /** Each URL the image can load: `src` and the `srcset` entries, absolute. */
    candidates: string[];
};

export type ShellLogoWatch = {
    /**
     * Passes when the first app-shell logo image of the current page is
     * loaded. Returns the URL the browser used for it.
     */
    expectAnswered(timeoutMs?: number): Promise<string>;
};

function seconds(ms: number): string {
    return `${ms / 1000} s`;
}

/**
 * Starts to record the image requests of the page. Call it BEFORE the
 * navigation: the open request is the only thing that can name the URL of an
 * image that has no response (`currentSrc` is empty in that state).
 *
 * Navigate with `waitUntil: "domcontentloaded"` (or "commit"): the default
 * `load` wait is the wait that a logo request with no response never
 * completes.
 */
export function watchShellLogo(page: Page): ShellLogoWatch {
    const openImageRequests = new Set<Request>();
    page.on("request", (request) => {
        if (request.resourceType() === "image") openImageRequests.add(request);
    });
    page.on("requestfinished", (request) => openImageRequests.delete(request));
    page.on("requestfailed", (request) => openImageRequests.delete(request));

    return {
        async expectAnswered(timeoutMs: number = SHELL_LOGO_TIMEOUT_MS): Promise<string> {
            const logo = page.locator(`img[alt="${SHELL_LOGO_ALT}"]`).first();
            await expect(
                logo,
                "the app shell has no logo image; the canary cannot measure",
            ).toBeAttached({ timeout: 15_000 });

            // The locator is resolved again on each read, so a re-rendered image
            // is still measured. `complete` is false only while the request is
            // open.
            const read = (): Promise<LogoState> =>
                logo.evaluate((image: HTMLImageElement) => ({
                    complete: image.complete,
                    naturalWidth: image.naturalWidth,
                    currentSrc: image.currentSrc,
                    candidates: [
                        image.src,
                        ...image.srcset
                            .split(",")
                            .map((candidate) => candidate.trim().split(/\s+/)[0])
                            .filter(Boolean)
                            .map((url) => new URL(url, document.baseURI).href),
                    ].filter(Boolean),
                }));

            const deadline = Date.now() + timeoutMs;
            let state = await read();
            while (!state.complete && Date.now() < deadline) {
                await page.waitForTimeout(POLL_INTERVAL_MS);
                state = await read();
            }

            // The deadline is not a pass: a request that is still open fails here.
            if (!state.complete) {
                const open = [
                    ...new Set(
                        [...openImageRequests]
                            .map((request) => request.url())
                            .filter((url) => state.candidates.includes(url)),
                    ),
                ];
                const named =
                    open.length > 0
                        ? `GET ${open.join(", ")}`
                        : `no open image request was recorded for it (was the watch started before the navigation?); its URLs: ${state.candidates.join(", ")}`;
                expect(
                    "pending",
                    `The app-shell logo request had no response after ${seconds(timeoutMs)}: ${named}\n` +
                        "The web server does not answer this URL (CHAOS-8538). The browser `load` event cannot fire on a signed-in page, " +
                        "so each test that waits for `load` there would run into its timeout. " +
                        'See the [WebServer] lines and the "PENDING at timeout" blocks in this log.',
                ).toBe("loaded");
            }

            const url = state.currentSrc || state.candidates[0] || "(no URL)";
            expect(
                state.naturalWidth > 0 ? "loaded" : "broken",
                `The app-shell logo request was answered, but the response is not an image the browser can show: GET ${url}`,
            ).toBe("loaded");
            return url;
        },
    };
}

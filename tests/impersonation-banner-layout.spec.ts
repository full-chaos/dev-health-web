import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * CHAOS-12379, offline: at 390px the impersonation banner must not draw the Stop Impersonating
 * button over the impersonated email, and the page must not scroll sideways. The session is marked
 * impersonating by answering the browser's own session read (`/api/auth/session`).
 */

const SHOTS = process.env.IMPERSONATION_BANNER_SHOTS ?? "";
const EMAIL = "firstname.lastname.with.a.long.local-part@subdomain.example-company.test";

async function shot(page: Page, name: string) {
    if (SHOTS === "") return;
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, `${name}.png`), animations: "disabled" });
}

/** Answers the browser's session read as an impersonating session with a long email. */
async function impersonating(context: BrowserContext) {
    await context.route("**/api/auth/session", async (route) => {
        let session: { user?: Record<string, unknown> } | null;
        let response: Awaited<ReturnType<typeof route.fetch>>;
        try {
            response = await route.fetch();
            session = (await response.json()) as typeof session;
        } catch {
            return;
        }
        if (session?.user !== undefined) {
            session.user.is_impersonating = true;
            session.user.impersonated_user_id = "user-impersonated-0001";
            session.user.impersonated_email = EMAIL;
        }
        await route.fulfill({ response, json: session }).catch(() => undefined);
    });
}

const VIEWPORTS = [
    { width: 390, height: 844, name: "banner-390" },
    { width: 1280, height: 800, name: "banner-1280" },
] as const;

for (const vp of VIEWPORTS) {
    test.describe(`${vp.width}px`, () => {
        test.use({ viewport: { width: vp.width, height: vp.height } });

        test("impersonation banner: email visible, button overlaps nothing", async ({ page }) => {
            await impersonating(page.context());
            // /dev, as the c5 spec: /dashboard at 390 px scrolls sideways for a reason the banner does not cause (its
            // ranked signals table, CHAOS-12459), so the page check runs where only the banner can add width.
            await page.goto("/dev");
            await expect(page.getByText("Viewing as").first()).toBeVisible();
            // The innermost element that holds the email (the title paragraph before the fix, its own span after).
            const email = page.getByText(EMAIL).last();
            const stop = page.getByRole("button", { name: "Stop Impersonating" });
            await expect(email).toBeVisible();
            await expect(stop).toBeVisible();
            await shot(page, vp.name);

            const emailBox = await email.boundingBox();
            const stopBox = await stop.boundingBox();
            expect(emailBox).not.toBeNull();
            expect(stopBox).not.toBeNull();
            const e = emailBox!;
            const s = stopBox!;
            const intersects =
                e.x < s.x + s.width &&
                s.x < e.x + e.width &&
                e.y < s.y + s.height &&
                s.y < e.y + e.height;
            expect(intersects, "email box and Stop button box do not intersect").toBe(false);

            const clip = await email.evaluate((el) => ({
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
            }));
            expect(clip.scrollWidth).toBeLessThanOrEqual(clip.clientWidth);
            expect(e.x).toBeGreaterThanOrEqual(0);
            expect(e.x + e.width).toBeLessThanOrEqual(vp.width);

            const page$ = await page.evaluate(() => ({
                scrollWidth: document.documentElement.scrollWidth,
                innerWidth: window.innerWidth,
            }));
            expect(page$.scrollWidth).toBeLessThanOrEqual(page$.innerWidth);
        });
    });
}

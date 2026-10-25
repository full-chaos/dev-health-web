import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
    { name: "short", width: 1280, height: 500 },
    { name: "tall", width: 1280, height: 1400 },
    { name: "mobile", width: 390, height: 844 },
];

type Case = {
    name: string;
    path: string;
    desktopOnly?: boolean;
    open: (page: Page) => Promise<void>;
};

const CASES: Case[] = [
    {
        name: "command palette (ui/Dialog)",
        desktopOnly: true,
        path: "/dashboard",
        open: async (page) => {
            await page.getByTestId("command-palette-trigger").click();
            await page.getByTestId("command-palette").waitFor({ state: "attached" });
        },
    },
    {
        name: "refund dialog",
        path: "/marketing/billing-refunds-test",
        open: async (page) => {
            await page.getByRole("button", { name: "Issue Refund" }).click();
        },
    },
    {
        name: "evidence drawer (ui/Drawer)",
        path: "/",
        open: async (page) => {
            await page.getByTestId("cockpit-top-change-evidence").click();
            await page.getByTestId("drawer-backdrop").waitFor({ state: "attached" });
        },
    },
    {
        name: "filter drawer",
        desktopOnly: true,
        path: "/",
        open: async (page) => {
            await page.getByRole("button", { name: /^Filters$/ }).click();
            await page.getByTestId("filter-drawer-backdrop").waitFor({ state: "attached" });
        },
    },
];

async function backdropRect(page: Page) {
    return page.evaluate(() => {
        const nodes = Array.from(
            document.querySelectorAll<HTMLElement>("div.fixed.inset-0"),
        ).filter((el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed");
        const el = nodes[nodes.length - 1];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
        };
    });
}

for (const viewport of VIEWPORTS) {
    for (const scrolled of [false, true]) {
        for (const c of CASES.filter((x) => !(x.desktopOnly && viewport.width < 768))) {
            test(`backdrop covers viewport: ${c.name} @ ${viewport.name}${scrolled ? " scrolled" : ""}`, async ({
                page,
            }) => {
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                await page.goto(c.path);
                if (scrolled) {
                    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                }
                await c.open(page);
                const rect = await backdropRect(page);
                expect(rect, "backdrop element found").not.toBeNull();
                expect(rect).toMatchObject({
                    x: 0,
                    y: 0,
                    width: rect!.innerWidth,
                    height: rect!.innerHeight,
                });
            });
        }
    }
}

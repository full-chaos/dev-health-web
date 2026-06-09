import { describe, it, expect } from "vitest";
import { navTrailForPathname, navTitleForPathname, getAreaById } from "../areas";

describe("navTrailForPathname — operating-review (hidden Plan child, CHAOS-2181 follow-up)", () => {
    it("returns the Plan area crumb only while Operating Review is hidden", () => {
        const trail = navTrailForPathname("/operating-review");
        expect(trail).toHaveLength(1);
        expect(trail[0]?.label).toBe("Plan");
        expect(trail[0]?.href).toBeUndefined();
    });

    it("Operating Review is hidden from nav (navVisible: false, preview: true)", () => {
        const child = getAreaById("plan")?.children.find((c) => c.id === "operating-review");
        expect(child?.navVisible).toBe(false);
        expect(child?.preview).toBe(true);
    });

    it("area crumb label matches the Plan area label verbatim (A6)", () => {
        const trail = navTrailForPathname("/operating-review");
        expect(trail[0]?.label).toBe(getAreaById("plan")?.label);
    });

    it("title for /operating-review falls back to the area label while hidden", () => {
        expect(navTitleForPathname("/operating-review")).toBe("Plan");
    });
});

describe("navTrailForPathname — AI child pages", () => {
    const tabPaths = ["/ai/review-load", "/ai/automations", "/ai/risk"];

    it.each(tabPaths)("%s trail starts with AI area crumb", (pathname) => {
        const trail = navTrailForPathname(pathname);
        expect(trail.length).toBeGreaterThanOrEqual(1);
        expect(trail[0]?.label).toBe("AI");
        expect(trail[0]?.href).toBe(getAreaById("ai")?.href);
    });

    it.each(tabPaths)("%s trail second crumb is the AI child label", (pathname) => {
        const trail = navTrailForPathname(pathname);
        expect(trail[1]?.label).toBe(navTitleForPathname(pathname));
    });

    it.each(tabPaths)("%s trail does NOT start with 'Home'", (pathname) => {
        const trail = navTrailForPathname(pathname);
        expect(trail[0]?.label).not.toBe("Home");
    });
});

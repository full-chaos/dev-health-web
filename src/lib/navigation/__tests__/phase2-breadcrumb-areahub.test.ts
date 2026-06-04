import { describe, it, expect } from "vitest";
import { navTrailForPathname, navTitleForPathname, getAreaById } from "../areas";

describe("navTrailForPathname — operating-review (Plan child)", () => {
  it("returns a two-crumb trail: Plan (linked) → Operating Review (current)", () => {
    const trail = navTrailForPathname("/operating-review");
    expect(trail).toHaveLength(2);
    expect(trail[0]?.label).toBe("Plan");
    expect(trail[0]?.href).toBe(getAreaById("plan")?.href);
    expect(trail[1]?.label).toBe("Operating Review");
    expect(trail[1]?.href).toBeUndefined();
  });

  it("trail label matches the sidebar child label verbatim (A6)", () => {
    const trail = navTrailForPathname("/operating-review");
    const child = getAreaById("plan")?.children.find((c) => c.id === "operating-review");
    expect(trail[trail.length - 1]?.label).toBe(child?.label);
  });

  it("area crumb label matches the Plan area label verbatim (A6)", () => {
    const trail = navTrailForPathname("/operating-review");
    expect(trail[0]?.label).toBe(getAreaById("plan")?.label);
  });

  it("title for /operating-review is 'Operating Review' (child label, not area label)", () => {
    expect(navTitleForPathname("/operating-review")).toBe("Operating Review");
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

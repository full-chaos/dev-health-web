import { describe, expect, it } from "vitest";

import { backLinkAllowed, lastBreadcrumbHref } from "@/lib/navigation/backLink";

describe("lastBreadcrumbHref", () => {
    it("is the area landing on a child destination", () => {
        expect(lastBreadcrumbHref("/investment")).toBe("/diagnose");
        expect(lastBreadcrumbHref("/plan/capacity")).toBe("/plan");
    });

    it("is undefined when the trail has no link: an area landing, the Home, an unowned route", () => {
        expect(lastBreadcrumbHref("/operating-review")).toBeUndefined();
        expect(lastBreadcrumbHref("/dashboard")).toBeUndefined();
        expect(lastBreadcrumbHref("/prs/repo:1")).toBeUndefined();
    });
});

describe("backLinkAllowed — a BackLink never repeats the last breadcrumb link (A5)", () => {
    it("refuses a BackLink to the page's own area: the breadcrumb is that return path", () => {
        expect(backLinkAllowed("/investment", "/diagnose")).toBe(false);
        expect(backLinkAllowed("/plan/capacity", "/plan")).toBe(false);
    });

    it("compares the bare path: state params do not make a different destination", () => {
        expect(backLinkAllowed("/investment", "/diagnose?f=abc&role=em&lens=pm")).toBe(false);
        expect(backLinkAllowed("/investment", "/diagnose#top")).toBe(false);
    });

    it("allows a BackLink from a detail page to its parent list", () => {
        expect(backLinkAllowed("/people/person-1", "/people?f=abc&q=ana")).toBe(true);
        expect(backLinkAllowed("/security/repos/repo-1", "/security?f=abc")).toBe(true);
    });

    it("allows a BackLink when the trail has no link", () => {
        expect(backLinkAllowed("/prs/repo:1", "/explore?f=abc")).toBe(true);
        expect(backLinkAllowed("/operating-review", "/plan")).toBe(true);
    });
});

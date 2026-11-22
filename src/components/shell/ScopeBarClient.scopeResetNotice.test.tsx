import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilterParam } from "@/lib/filters/encode";
import { FILTER_OPTIONS, scopeBarUrl } from "@/test/scopeBarHarness";

import { ScopeBarClient } from "./ScopeBarClient";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: scopeBarUrl.replace, push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => scopeBarUrl.pathname,
    useSearchParams: () => new URLSearchParams(scopeBarUrl.search),
}));
vi.mock("@/components/filters/useFilterOptions", () => ({
    useFilterOptions: () => FILTER_OPTIONS,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const WORK = {
    view: "work" as const,
    resolvedVisibility: { developer: true, workType: true, unreadFilters: [] },
    resolvedScopeLock: "team" as const,
};

const withScope = (scope: { level: "service" | "team"; ids: string[] }) =>
    `f=${encodeFilterParam({ ...defaultMetricFilter, scope })}`;

// CHAOS-14489: the team lock resets an unknown service scope; the bar says so in a notice.
describe("scope bar: notice when the team lock resets a service scope", () => {
    it("shows the notice after the reset to {team, []}", () => {
        scopeBarUrl.reset(withScope({ level: "service", ids: ["service-does-not-exist"] }));
        render(<ScopeBarClient {...WORK} />);

        expect(scopeBarUrl.lastFilter().scope).toEqual({ level: "team", ids: [] });
        expect(screen.getByRole("status").textContent).toBe(
            "The selected service was not found; the filter was reset.",
        );
    });

    it("shows no notice for a team scope", () => {
        scopeBarUrl.reset(withScope({ level: "team", ids: [] }));
        render(<ScopeBarClient {...WORK} />);

        expect(screen.queryByTestId("scope-reset-notice")).toBeNull();
    });
});

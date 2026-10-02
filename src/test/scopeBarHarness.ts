import { vi } from "vitest";

import { decodeFilter } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";

/**
 * Test harness for the scope bar: a URL the mocked router reads and writes, as
 * the real router does with `router.replace`.
 */
export const scopeBarUrl = {
    pathname: "/dashboard",
    search: "",
    replace: vi.fn((href: string) => {
        const query = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
        scopeBarUrl.search = query;
    }),
    reset(search = "") {
        scopeBarUrl.pathname = "/dashboard";
        scopeBarUrl.search = search;
        scopeBarUrl.replace.mockClear();
    },
    /** Params of the last URL the bar wrote. */
    lastParams(): URLSearchParams {
        const calls = scopeBarUrl.replace.mock.calls;
        if (calls.length === 0) throw new Error("the bar did not write a URL");
        const href = calls[calls.length - 1][0];
        return new URLSearchParams(href.slice(href.indexOf("?") + 1));
    },
    /** The filter in the last URL the bar wrote. */
    lastFilter(): MetricFilter {
        return decodeFilter(scopeBarUrl.lastParams().get("f"));
    },
};

export const FILTER_OPTIONS = {
    teams: ["platform", "payments"],
    repos: ["org/api", "org/web"],
    services: [],
    developers: ["ana@example.com", "bo@example.com"],
    work_category: ["feature", "maintenance"],
};

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
        scopeBarUrl.historyWrite.mockClear();
    },
    /**
     * The default `f` is written with the history API, not `router.replace`: no server render
     * (CHAOS-9130). The spy lets the test see the URL it calls through, so the URL in jsdom follows.
     */
    historyWrite: vi.spyOn(window.history, "replaceState"),
    /** Params of the last URL the bar wrote with the history API (the default `f`). */
    lastDefaultParams(): URLSearchParams {
        const calls = scopeBarUrl.historyWrite.mock.calls;
        if (calls.length === 0) throw new Error("the bar did not write a default URL");
        const href = String(calls[calls.length - 1][2]);
        return new URLSearchParams(href.slice(href.indexOf("?") + 1));
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
    team_names: { platform: "platform", payments: "payments" },
    repo_names: {},
    developer_names: {
        "ana@example.com": "Ana Silva",
        "bo@example.com": "Bo Chen",
    },
    repos: ["org/api", "org/web"],
    services: [],
    developers: ["ana@example.com", "bo@example.com"],
    work_category: ["feature", "maintenance"],
};

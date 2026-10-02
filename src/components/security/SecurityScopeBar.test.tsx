import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
    decodeSecurityFilter,
    defaultSecurityFilter,
    encodeSecurityFilter,
} from "@/lib/filters/security";

import { SecurityScopeBar, TOP_REPOS_LIMIT } from "./SecurityScopeBar";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
const overview = vi.hoisted(() => ({ calls: [] as unknown[] }));

const API = "0b1f6a52-6f0b-4f4e-9d0a-1c2d3e4f5a61";
const WEB = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

let search = "";

vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/security",
    useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/lib/graphql/hooks/useSecurity", () => ({
    useSecurityOverview: (filter: unknown) => {
        overview.calls.push(filter);
        return {
            data: {
                securityOverview: {
                    topRepos: [
                        { repoId: API, repoName: "org/api", repoUrl: "", count: 5 },
                        { repoId: WEB, repoName: "org/web", repoUrl: "", count: 2 },
                    ],
                },
            },
        };
    },
}));

function lastFilter() {
    const href = router.replace.mock.calls.at(-1)?.[0] as string;
    return decodeSecurityFilter(new URL(href, "https://x.test").searchParams.get("f") ?? undefined);
}

beforeEach(() => {
    router.replace.mockClear();
    overview.calls = [];
    search = `f=${encodeSecurityFilter(defaultSecurityFilter())}&role=em`;
});

describe("SecurityScopeBar", () => {
    it("has the organization and repository in the row and the three page rows in the same card", () => {
        render(<SecurityScopeBar encodedFilter={encodeSecurityFilter(defaultSecurityFilter())} />);

        const bar = screen.getByTestId("scope-bar");
        expect(bar).toHaveAttribute("data-view", "security");
        expect(within(bar).getByRole("button", { name: /^Repo/ })).toBeInTheDocument();
        expect(within(bar).queryByRole("button", { name: /^Team/ })).toBeNull();
        expect(within(bar).queryByRole("group", { name: "Window" })).toBeNull();
        for (const name of ["Security severity", "Security state", "Security source"]) {
            expect(within(bar).getByRole("radiogroup", { name })).toBeInTheDocument();
        }
        expect(screen.getAllByTestId("security-filter-bar")).toHaveLength(1);
    });

    it("says the repository menu lists repositories with alerts, with the limit", () => {
        render(<SecurityScopeBar encodedFilter={encodeSecurityFilter(defaultSecurityFilter())} />);

        const caption = screen.getByTestId("security-repo-caption");
        expect(caption).toHaveTextContent("Repositories with alerts");
        expect(caption).toHaveTextContent(`up to ${TOP_REPOS_LIMIT}`);
        expect(TOP_REPOS_LIMIT).toBe(10);
    });

    it("reads the repository options without the repository filter, so a selection does not shrink the menu", () => {
        const encoded = encodeSecurityFilter({ openOnly: true, repoIds: [API] });
        search = `f=${encoded}`;
        render(<SecurityScopeBar encodedFilter={encoded} />);

        expect(overview.calls.length).toBeGreaterThan(0);
        for (const call of overview.calls) {
            expect((call as { repoIds?: string[] }).repoIds).toBeUndefined();
        }
        // The selected repository is shown by its name, not its UUID.
        expect(screen.getByRole("button", { name: /^Repo/ })).toHaveTextContent("org/api");
    });

    it("writes the picked repository UUID to repoIds in the Security f and keeps other params", async () => {
        render(<SecurityScopeBar encodedFilter={encodeSecurityFilter(defaultSecurityFilter())} />);

        await userEvent.click(screen.getByRole("button", { name: /^Repo/ }));
        await userEvent.click(screen.getByRole("checkbox", { name: "org/web" }));

        expect(lastFilter()).toEqual({ openOnly: true, repoIds: [WEB] });
        const href = router.replace.mock.calls.at(-1)?.[0] as string;
        expect(new URL(href, "https://x.test").searchParams.get("role")).toBe("em");
    });

    it("Reset writes the default Security filter", async () => {
        const encoded = encodeSecurityFilter({ openOnly: false, severities: ["critical"] });
        search = `f=${encoded}`;
        render(<SecurityScopeBar encodedFilter={encoded} />);

        await userEvent.click(screen.getByRole("button", { name: "Reset" }));

        expect(lastFilter()).toEqual(defaultSecurityFilter());
    });
});

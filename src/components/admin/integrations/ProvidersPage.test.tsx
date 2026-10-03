import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, within } from "@/test/utils";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
    usePathname: () => "/org/admin/integrations",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/admin/server", () => ({
    testConnection: vi.fn(),
    createCredential: vi.fn(),
}));

import { ProvidersPage } from "./ProvidersPage";
import type { ProviderRow } from "./ProviderTable";

function makeRow(overrides: Partial<ProviderRow> = {}): ProviderRow {
    return {
        id: "github",
        name: "GitHub",
        description: "",
        icon: <span />,
        status: "not_configured",
        credentialCount: 0,
        singleCredentialName: null,
        authMethodLabel: null,
        lastTestedAt: null,
        syncConfigCount: 0,
        ...overrides,
    };
}

describe("ProvidersPage", () => {
    it("renders the provider table with an Add Provider action, not a card grid", () => {
        render(
            <ProvidersPage canCreatePagerDuty={false} providers={[makeRow()]} credentials={[]} />,
        );

        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Add Provider" })).toBeInTheDocument();
    });

    it("keeps PagerDuty in the provider catalog with a direct manage route", () => {
        render(
            <ProvidersPage
                canCreatePagerDuty
                providers={[makeRow({ id: "pagerduty", name: "PagerDuty" })]}
                credentials={[]}
            />,
        );

        for (const link of screen.getAllByRole("link", { name: "Manage" })) {
            expect(link).toHaveAttribute("href", "/org/admin/integrations/pagerduty");
        }
    });

    it("hides an unconfigured PagerDuty catalog row when creation is unavailable", () => {
        render(
            <ProvidersPage
                canCreatePagerDuty={false}
                providers={[makeRow({ id: "pagerduty", name: "PagerDuty" })]}
                credentials={[]}
            />,
        );

        expect(screen.queryByText("PagerDuty")).not.toBeInTheDocument();
    });

    it("keeps an existing PagerDuty catalog row reachable for management when creation is unavailable", () => {
        render(
            <ProvidersPage
                canCreatePagerDuty={false}
                providers={[
                    makeRow({
                        id: "pagerduty",
                        name: "PagerDuty",
                        credentialCount: 1,
                        singleCredentialName: "production",
                    }),
                ]}
                credentials={[]}
            />,
        );

        expect(screen.getAllByText("PagerDuty")).toHaveLength(2);
        expect(screen.getAllByRole("link", { name: "Manage" })[0]).toHaveAttribute(
            "href",
            "/org/admin/integrations/pagerduty",
        );
    });

    it("opens the Add Provider wizard, starting on the provider-select step", async () => {
        render(
            <ProvidersPage canCreatePagerDuty={false} providers={[makeRow()]} credentials={[]} />,
        );

        await userEvent.click(screen.getByRole("button", { name: "Add Provider" }));

        expect(
            screen.getByText("Choose the tool you want Dev Health to connect to."),
        ).toBeInTheDocument();
    });
});

describe("ProvidersPage header and notice (CHAOS-8099)", () => {
    it("has the title Connections and Add Provider in the header with the icon before the label", () => {
        render(
            <ProvidersPage canCreatePagerDuty={false} providers={[makeRow()]} credentials={[]} />,
        );

        expect(screen.getByRole("heading", { level: 1, name: "Connections" })).toBeInTheDocument();
        const add = within(screen.getByTestId("page-header")).getByRole("button", {
            name: "Add Provider",
        });
        expect(add.firstElementChild?.querySelector("svg")).not.toBeNull();
        expect(add.lastChild?.nodeType).toBe(Node.TEXT_NODE);
        expect(screen.getByRole("heading", { level: 2, name: "Providers" })).toBeInTheDocument();
    });

    it("shows the given notice above the table", () => {
        render(
            <ProvidersPage
                canCreatePagerDuty={false}
                providers={[makeRow()]}
                credentials={[]}
                notice={<p>Providers could not be loaded.</p>}
            />,
        );

        expect(screen.getByText("Providers could not be loaded.")).toBeInTheDocument();
    });
});

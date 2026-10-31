import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/metrics" }));
// The session's organization id, as the app layout's GraphQL provider holds it.
const session = vi.hoisted(() => ({ orgId: undefined as string | undefined }));
vi.mock("@/lib/graphql/orgIdContext", () => ({ useOrgId: () => session.orgId }));
vi.mock("next/navigation", () => ({
    usePathname: () => nav.pathname,
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { ShellOrganizationProvider } from "@/components/shell/ShellContext";
import type { PageEntityInput } from "@/lib/ask-dev/page-context";

import { AskDevPageContextProvider, useAskDevPageProposal } from "../AskDevPageContext";
import { AskDevPageEntities } from "../AskDevPageEntities";

// CHAOS-11938: a server page states its entities through this component; with `organization`
// the active organization goes first, by ACR's id and the name the shell loaded.
const ON = { ask_dev_contextual_entrypoints: true };
const TEAM: PageEntityInput = { kind: "team", id: "team:linear:TEAMA", label: "Platform" };
const ACME = { name: "Acme", hasData: true, lastMetricsAt: null };

function Proposed() {
    const { refs } = useAskDevPageProposal();
    return <output data-testid="proposed">{JSON.stringify(refs)}</output>;
}

function renderPage(props: {
    orgId?: string;
    organization?: typeof ACME | null;
    entities?: readonly PageEntityInput[];
    withOrganization?: boolean;
}) {
    session.orgId = props.orgId;
    return render(
        <AdminTierProvider tier="team" features={ON}>
            <AskDevPageContextProvider>
                <ShellOrganizationProvider value={props.organization}>
                    <AskDevPageEntities
                        organization={props.withOrganization ?? true}
                        entities={props.entities}
                    />
                </ShellOrganizationProvider>
                <Proposed />
            </AskDevPageContextProvider>
        </AdminTierProvider>,
    );
}

const proposed = () => JSON.parse(screen.getByTestId("proposed").textContent ?? "[]") as unknown;

beforeEach(() => {
    nav.pathname = "/metrics";
});

describe("AskDevPageEntities", () => {
    it("proposes the active organization first, by ACR's id and its name, then the page's entities", async () => {
        renderPage({ orgId: "org-1", organization: ACME, entities: [TEAM] });
        await waitFor(() =>
            expect(proposed()).toEqual([
                { kind: "organization", id: "organization:org-1", label: "Acme" },
                TEAM,
            ]),
        );
    });

    it("proposes no organization until its name is known, so a chip never shows an id", async () => {
        renderPage({ orgId: "org-1", organization: null, entities: [TEAM] });
        await waitFor(() => expect(proposed()).toEqual([TEAM]));
    });

    it("proposes no organization without the session's organization id", async () => {
        renderPage({ orgId: undefined, organization: ACME, entities: [TEAM] });
        await waitFor(() => expect(proposed()).toEqual([TEAM]));
    });

    it("proposes the organization only when the page asks for it", async () => {
        renderPage({
            orgId: "org-1",
            organization: ACME,
            entities: [TEAM],
            withOrganization: false,
        });
        await waitFor(() => expect(proposed()).toEqual([TEAM]));
    });

    it("renders nothing of its own", () => {
        const { container } = renderPage({ orgId: "org-1", organization: ACME });
        expect(container.querySelectorAll("*:not(output)").length).toBe(0);
    });
});

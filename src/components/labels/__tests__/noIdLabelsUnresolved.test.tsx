import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BlockedWorkItemsTable } from "@/app/(app)/explore/BlockedWorkEvidence";
import { AliasSuggestionRow } from "@/app/(app)/data-health/_components/AliasSuggestionRow";
import { ConnectorStatusTable } from "@/app/(app)/data-health/_components/ConnectorStatusTable";
import { InvoiceList } from "@/components/admin/billing/InvoiceList";
import { AIAttributionDashboard } from "@/components/ai/AIAttributionDashboard";
import { AIViolationsList } from "@/components/ai/AIViolationsList";
import { CommitHashDisclosure } from "@/components/shared/CommitHashDisclosure";
import { RelatedEntitiesPanel } from "@/components/work/RelatedEntitiesPanel";
import { containsIdToken } from "@/lib/labels/idToken";
import { entityHeading, UNRESOLVED } from "@/lib/labels/unresolved";

const { mockOverview } = vi.hoisted(() => ({ mockOverview: vi.fn() }));
vi.mock("@/lib/graphql/hooks/useAIReviewRisk", () => ({ useAIAttributionOverview: mockOverview }));
vi.mock("@/lib/billing/actions", () => ({ getInvoices: vi.fn(), voidInvoice: vi.fn() }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/x",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const HASH = "9fceb02d0ae598e95dc970b74767f19372d61af8";
const IDS = [UUID, `jira:${UUID}`, "gh:acme-web"];

afterEach(() => cleanup());

/** Every text node, title, aria-label and alt in the DOM must be free of id tokens. */
function expectNoIdTokens(container: HTMLElement): void {
    const offenders: string[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        if (containsIdToken(text)) offenders.push(`text: ${text}`);
    }
    for (const el of container.querySelectorAll("*")) {
        for (const attr of ["title", "aria-label", "alt"]) {
            const value = el.getAttribute(attr);
            if (value && containsIdToken(value)) offenders.push(`${attr}: ${value}`);
        }
    }
    expect(offenders).toEqual([]);
}

describe.each(IDS)("unresolved surfaces never show a raw id (%s)", (id) => {
    it("evidence quotes in RelatedEntitiesPanel", () => {
        const { container, getByText } = render(
            <RelatedEntitiesPanel
                rootType="PR"
                rootId="x"
                drilldown={{
                    orgId: "o",
                    rootType: "PR",
                    rootId: "x",
                    nodes: [],
                    edges: [],
                    partial: false,
                    dataAvailable: true,
                }}
                investment={{
                    workUnitId: "x",
                    themeDistribution: {},
                    subcategoryDistribution: {},
                    evidenceQuotes: [{ quote: "q", sourceType: "pr", sourceId: id }],
                }}
            />,
        );
        expectNoIdTokens(container);
        expect(getByText(`Pull request · ${UNRESOLVED}`)).toBeTruthy();
    });

    it("blocked work table", () => {
        const { container } = render(
            <BlockedWorkItemsTable
                blockedIssues={
                    {
                        count: 1,
                        items: [{ work_item_id: id, provider: "jira", status: "Blocked" }],
                    } as never
                }
            />,
        );
        expectNoIdTokens(container);
    });

    it("AI attribution and violations", () => {
        mockOverview.mockReturnValue({
            data: {
                orgId: "o",
                startDate: "2026-04-01",
                endDate: "2026-05-01",
                mix: [],
                totalAttributed: 1,
                hasMore: false,
                dataAvailable: true,
                rows: [
                    {
                        subjectType: "pull_request",
                        subjectId: id,
                        repoId: id,
                        provider: "github",
                        kind: "ai_assisted",
                        source: "pr_label",
                        confidence: 0.9,
                        actor: null,
                        evidence: "{}",
                        observedAt: "2026-04-15T00:00:00Z",
                        teamId: id,
                    },
                ],
            },
            fetching: false,
            error: undefined,
        });
        const a = render(
            <AIAttributionDashboard filter={{ startDate: "2026-04-01", endDate: "2026-05-01" }} />,
        );
        expectNoIdTokens(a.container);
        const v = render(
            <AIViolationsList
                violations={[
                    {
                        ruleId: id,
                        subjectId: id,
                        subjectType: "pr",
                        severity: "high",
                        evidence: "e",
                        observedAt: "2026-04-15T00:00:00Z",
                    },
                ]}
            />,
        );
        expectNoIdTokens(v.container);
    });

    it("data-health rows", () => {
        const a = render(
            <AliasSuggestionRow
                suggestion={{
                    unmappedIdentity: { provider: "github" },
                    suggestedCanonicalId: id,
                    confidence: 0.8,
                }}
            />,
        );
        expectNoIdTokens(a.container);
        const c = render(
            <ConnectorStatusTable data={[{ provider: "github", scope: id, rowsIngested: 1 }]} />,
        );
        expectNoIdTokens(c.container);
    });

    it("invoice list org column", () => {
        const { container } = render(
            <InvoiceList
                showOrgColumn
                initialData={
                    {
                        items: [
                            {
                                id,
                                org_id: id,
                                status: "open",
                                amount_due: 100,
                                amount_paid: 0,
                                amount_remaining: 100,
                                currency: "usd",
                                created_at: "2024-01-01T00:00:00Z",
                                stripe_invoice_id: "in_ABC",
                                stripe_customer_id: "cus_ABC",
                                line_items: [],
                            },
                        ],
                        total: 1,
                        limit: 10,
                        offset: 0,
                    } as never
                }
            />,
        );
        expectNoIdTokens(container);
        expect(container.textContent).not.toMatch(/in_ABC|cus_ABC/);
    });
});

describe("other id-free guards", () => {
    it("a commit hash is not an id: its disclosure still shows the hash", () => {
        const { container } = render(<CommitHashDisclosure hash={HASH} />);
        expect(container.textContent).toContain(HASH.slice(0, 8));
    });

    it("entityHeading falls back to the type word for ids", () => {
        expect(entityHeading({ work_item_id: UUID }, "Issue")).toBe("Issue");
        expect(entityHeading({ title: UUID }, "Issue")).toBe("Issue");
        expect(entityHeading({ title: `jira:${UUID}` }, "Issue")).toBe("Issue");
        expect(entityHeading({ name: "Deploy web" }, "Deployment")).toBe("Deploy web");
    });
});

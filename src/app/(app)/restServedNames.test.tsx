import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { containsIdToken } from "@/lib/labels/idToken";

import DeploymentDetailPage from "./deployments/[deployment_id]/page";
import IssueDetailPage from "./issues/[issue_id]/page";
import OrgDetailPage from "./superadmin/orgs/[id]/page";

const mocks = vi.hoisted(() => ({ getFlame: vi.fn(), listOrgMembers: vi.fn() }));

vi.mock("next/navigation", () => ({
    notFound: vi.fn(),
    usePathname: () => "/x",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/api/visuals", () => ({ getFlame: mocks.getFlame }));
vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));
vi.mock("@/components/charts/FlameDiagram", () => ({ FlameDiagram: () => null }));
vi.mock("@/components/shell/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/work/RelatedEntitiesPanel", () => ({ RelatedEntitiesPanel: () => null }));
vi.mock("@/lib/graphql/workGraphFetchers", () => ({
    getAIWorkflowDrilldownViaGraphQL: vi.fn().mockResolvedValue(null),
    getWorkUnitInvestmentDistribution: vi.fn(),
}));
vi.mock("@/components/admin/AdminHeader", () => ({ AdminHeader: () => null }));
vi.mock("@/components/superadmin/OrgEditForm", () => ({ OrgEditForm: () => null }));
vi.mock("@/components/superadmin/OrgDeleteSection", () => ({ OrgDeleteSection: () => null }));
vi.mock("@/lib/admin/server", () => ({
    getOrganization: vi.fn().mockResolvedValue({
        data: { id: "o1", name: "Acme", slug: "acme" },
        error: null,
    }),
    listOrgMembers: mocks.listOrgMembers,
}));

const UUID = "3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c";
const timeline = { start: "2026-10-01T10:00:00Z", end: "2026-10-01T11:00:00Z" };
const flame = (entity: Record<string, unknown>) => ({ entity, timeline, frames: [] });

beforeEach(() => vi.clearAllMocks());

describe("REST names served by ops (CHAOS-8946)", () => {
    it("issue page heading is the served title", async () => {
        mocks.getFlame.mockResolvedValue(
            flame({ work_item_id: `jira:${UUID}`, title: "Fix login" }),
        );
        render(await IssueDetailPage({ params: Promise.resolve({ issue_id: "i1" }) }));
        expect(screen.getByRole("heading", { name: "Fix login" })).toBeInTheDocument();
    });

    it.each([null, undefined])(
        "issue page heading is Unresolved when title is %s",
        async (title) => {
            mocks.getFlame.mockResolvedValue(flame({ work_item_id: `jira:${UUID}`, title }));
            const { container } = render(
                await IssueDetailPage({ params: Promise.resolve({ issue_id: "i1" }) }),
            );
            expect(screen.getByRole("heading", { name: "Unresolved" })).toBeInTheDocument();
            expect(containsIdToken(container.textContent ?? "")).toBe(false);
        },
    );

    it("deployment page heading is the served name, Unresolved when null", async () => {
        mocks.getFlame.mockResolvedValue(flame({ deployment_id: UUID, name: "release-2026.10" }));
        const first = render(
            await DeploymentDetailPage({ params: Promise.resolve({ deployment_id: UUID }) }),
        );
        expect(screen.getByRole("heading", { name: "release-2026.10" })).toBeInTheDocument();
        first.unmount();

        mocks.getFlame.mockResolvedValue(flame({ deployment_id: UUID, name: null }));
        const { container } = render(
            await DeploymentDetailPage({ params: Promise.resolve({ deployment_id: UUID }) }),
        );
        expect(screen.getByRole("heading", { name: "Unresolved" })).toBeInTheDocument();
        expect(containsIdToken(container.textContent ?? "")).toBe(false);
    });

    it("superadmin member rows show user_name and email, Unresolved with no name", async () => {
        const member = (id: string, extra: Record<string, unknown>) => ({
            id,
            org_id: "o1",
            user_id: UUID,
            role: "member",
            invited_by_id: null,
            joined_at: null,
            created_at: "2026-10-01T00:00:00Z",
            updated_at: "2026-10-01T00:00:00Z",
            ...extra,
        });
        mocks.listOrgMembers.mockResolvedValue({
            data: [
                member("m1", { user_name: "Sam Rivera", user_email: "sam@acme.test" }),
                member("m2", { user_name: null, user_email: null }),
                member("m3", {}),
            ],
            error: null,
        });
        const { container } = render(
            await OrgDetailPage({ params: Promise.resolve({ id: "o1" }) }),
        );
        expect(screen.getByText("Sam Rivera")).toBeInTheDocument();
        expect(screen.getByText("sam@acme.test")).toBeInTheDocument();
        expect(screen.getAllByText("Unresolved")).toHaveLength(2);
        expect(container.textContent).not.toContain(UUID);
    });
});

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { containsIdToken } from "@/lib/labels/idToken";
import type {
    CustomerPushBatchSummary,
    CustomerPushSource,
    CustomerPushToken,
} from "@/lib/admin/types";
import { IdentityTable, type Identity } from "../identities/IdentityTable";
import { CustomerPushSourceList } from "../integrations/customer-push/CustomerPushSourceList";
import { CustomerPushSourceOverview } from "../integrations/customer-push/CustomerPushSourceOverview";
import { CustomerPushTokenList } from "../integrations/customer-push/CustomerPushTokenList";
import { CustomerPushBatchList } from "../integrations/customer-push/CustomerPushBatchList";
import { CopyIdButton } from "@/app/(app)/org/admin/audit-logs/CopyIdButton";
import { AuditIdentityLabel } from "@/app/(app)/org/admin/audit-logs/AuditIdentityLabel";

vi.mock("@/lib/admin/server", () => ({
    rotateCustomerPushToken: vi.fn(),
    revokeCustomerPushToken: vi.fn(),
}));

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const IDS = [UUID, `jira:${UUID}`];

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

describe.each(IDS)("admin surfaces never show a raw id (%s)", (id) => {
    it("IdentityTable with no name and no email", () => {
        const identity: Identity = {
            canonical_id: id,
            display_name: null,
            email: null,
            team_ids: [id],
            provider_identities: {},
        };
        const { container } = render(<IdentityTable identities={[identity]} teamNames={{}} />);
        expectNoIdTokens(container);
    });

    it("customer-push source list and overview with no display name", () => {
        const source: CustomerPushSource = {
            id,
            org_id: id,
            system: "github",
            instance: "acme-prod",
            display_name: null,
            mode: "customer_push",
            enabled: true,
            webhook_mode: "disabled",
            matched_integration_source_id: id,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            warnings: [],
        };
        const list = render(
            <CustomerPushSourceList provider="github" providerName="GitHub" sources={[source]} />,
        );
        expectNoIdTokens(list.container);
        cleanup();
        const overview = render(<CustomerPushSourceOverview provider="github" source={source} />);
        expectNoIdTokens(overview.container);
    });

    it("customer-push token list", () => {
        const token: CustomerPushToken = {
            id,
            org_id: id,
            source_id: id,
            name: "ci-token",
            token_prefix: "fc_live",
            scopes: ["ingest:write"],
            expires_at: null,
            revoked_at: null,
            last_used_at: null,
            created_at: "2026-01-01T00:00:00Z",
        };
        const { container } = render(
            <CustomerPushTokenList tokens={[token]} newTokenHref="/new" examplesHref="/ex" />,
        );
        expectNoIdTokens(container);
    });

    it("customer-push batch list", () => {
        const batch: CustomerPushBatchSummary = {
            ingestion_id: id,
            status: "completed",
            source_system: "github",
            source_instance: "acme-prod",
            producer: "cli",
            items_received: 3,
            items_accepted: 3,
            items_rejected: 0,
            created_at: "2026-01-01T00:00:00Z",
            completed_at: "2026-01-01T00:01:00Z",
        };
        const { container } = render(
            <CustomerPushBatchList
                provider="github"
                sourceId={id}
                batches={[batch]}
                validateHref="/v"
                examplesHref="/ex"
            />,
        );
        expectNoIdTokens(container);
    });

    it("CopyIdButton", () => {
        const { container } = render(<CopyIdButton value={id} label="actor ID" />);
        expectNoIdTokens(container);
    });

    it("AuditIdentityLabel with and without a name", () => {
        const unnamed = render(
            <AuditIdentityLabel
                id={id}
                displayName={null}
                emptyLabel="System"
                copyLabel="actor ID"
            />,
        );
        expectNoIdTokens(unnamed.container);
        cleanup();
        const named = render(
            <AuditIdentityLabel
                id={id}
                displayName="Audit Actor"
                emptyLabel="System"
                copyLabel="actor ID"
            />,
        );
        expectNoIdTokens(named.container);
    });
});

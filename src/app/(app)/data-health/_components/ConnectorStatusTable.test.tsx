import { describe, expect, it } from "vitest";
import { render } from "@/test/utils";
import { ConnectorStatusTable, type ConnectorStatusItem } from "./ConnectorStatusTable";

const STORED =
    "dial tcp 10.1.2.3:5432: connect: connection refused (provider github, token ghp_example, cmd/worker/sync.go:88)";

const row = (over: Partial<ConnectorStatusItem> = {}): ConnectorStatusItem => ({
    provider: "github",
    scope: "org/repo",
    lastSyncAt: "2026-09-01T10:00:00Z",
    rowsIngested: 12,
    lastFailure: { occurredAt: "2026-09-02T10:00:00Z", message: STORED, stage: "fetch" },
    ...over,
});

describe("ConnectorStatusTable (CHAOS-8436)", () => {
    it("shows a plain sentence and the time of a failure, never the stored worker text", () => {
        const { container } = render(<ConnectorStatusTable data={[row()]} />);
        expect(container.textContent).toContain("Last sync failed");
        expect(container.textContent).not.toContain("connection refused");
        expect(container.textContent).not.toContain("ghp_example");
        expect(container.textContent).not.toContain("sync.go");
        // not in a tooltip either
        expect(container.innerHTML).not.toContain("connection refused");
    });

    it("shows a dash when there is no failure", () => {
        const { container } = render(<ConnectorStatusTable data={[row({ lastFailure: null })]} />);
        expect(container.textContent).not.toContain("Last sync failed");
    });
});

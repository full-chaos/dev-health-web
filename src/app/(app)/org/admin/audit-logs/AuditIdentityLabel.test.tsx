import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@/test/utils";
import { AuditIdentityLabel } from "./AuditIdentityLabel";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("AuditIdentityLabel", () => {
    afterEach(() => cleanup());

    it("renders the empty label when id is null (e.g. a system-initiated action)", () => {
        render(<AuditIdentityLabel id={null} emptyLabel="System" copyLabel="actor ID" />);
        expect(screen.getByText("System")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /copy/i })).not.toBeInTheDocument();
    });

    it("shows an explicit Unresolved primary label for an id with no known name", () => {
        render(<AuditIdentityLabel id={UUID} emptyLabel="System" copyLabel="actor ID" />);
        expect(screen.getByText("Unresolved")).toBeInTheDocument();
    });

    it("never renders the raw id as the primary label", () => {
        render(<AuditIdentityLabel id={UUID} emptyLabel="System" copyLabel="actor ID" />);
        const primary = screen.getByText("Unresolved").closest("span");
        expect(primary).not.toHaveTextContent(UUID);
    });

    it("shows the full id as secondary, copyable text", () => {
        render(<AuditIdentityLabel id={UUID} emptyLabel="System" copyLabel="actor ID" />);
        expect(screen.getByText(UUID)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /copy actor id/i })).toBeInTheDocument();
    });
});

import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@/test/utils";
import { AuditIdentityLabel } from "./AuditIdentityLabel";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("AuditIdentityLabel", () => {
    afterEach(() => cleanup());

    it("renders the empty label when id is null (e.g. a system-initiated action)", () => {
        render(
            <AuditIdentityLabel
                id={null}
                displayName={null}
                emptyLabel="System"
                copyLabel="actor ID"
            />,
        );
        expect(screen.getByText("System")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /copy/i })).not.toBeInTheDocument();
    });

    it("shows an explicit Unresolved primary label for an id with no known name", () => {
        render(
            <AuditIdentityLabel
                id={UUID}
                displayName={null}
                emptyLabel="System"
                copyLabel="actor ID"
            />,
        );
        expect(screen.getByText("Unresolved")).toBeInTheDocument();
    });

    it("never renders the raw id as the primary label", () => {
        render(
            <AuditIdentityLabel
                id={UUID}
                displayName={null}
                emptyLabel="System"
                copyLabel="actor ID"
            />,
        );
        const primary = screen.getByText("Unresolved").closest("span");
        expect(primary).not.toHaveTextContent(UUID);
    });

    it("prints no id or id piece in the cell: Unresolved + an icon Copy that carries the full id", () => {
        const { container } = render(
            <AuditIdentityLabel
                id={UUID}
                displayName={null}
                emptyLabel="System"
                copyLabel="actor ID"
            />,
        );
        expect(container.textContent).not.toContain(UUID);
        const copy = screen.getByRole("button", { name: /copy actor id/i });
        expect(copy).toHaveAttribute("title", `Copy actor ID: ${UUID}`);
        expect(copy.textContent).toBe("");
        expect(copy.querySelector("svg")).not.toBeNull();
    });

    it("keeps the full id as a second line when asked (the detail drawer)", () => {
        render(
            <AuditIdentityLabel
                id={UUID}
                displayName={null}
                emptyLabel="System"
                copyLabel="actor ID"
                showFullId
            />,
        );
        expect(screen.getByText(UUID)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /copy actor id/i })).toBeInTheDocument();
    });

    it("keeps the Copy icon on the same row as the label in the stacked cell (design: inline)", () => {
        const { container } = render(
            <AuditIdentityLabel
                id={UUID}
                displayName={null}
                emptyLabel="System"
                copyLabel="actor ID"
            />,
        );

        const row = container.firstElementChild as HTMLElement;
        expect(row.className).not.toContain("flex-col");
        expect(row.className).toContain("items-center");
        expect(row).toContainElement(screen.getByText("Unresolved"));
        expect(row).toContainElement(screen.getByRole("button", { name: /copy actor id/i }));
    });

    it("treats an absent displayName like null and never shows an id piece", () => {
        const { container } = render(
            <AuditIdentityLabel id={UUID} emptyLabel="System" copyLabel="actor ID" />,
        );
        expect(screen.getByText("Unresolved")).toBeInTheDocument();
        expect(container.textContent).not.toMatch(/550e8400|[0-9a-f]{8}/i);
    });

    it("uses only the served display name while retaining the served id", () => {
        render(
            <AuditIdentityLabel
                id={UUID}
                displayName="Audit Actor"
                emptyLabel="System"
                copyLabel="actor ID"
                showFullId
            />,
        );

        expect(screen.getByText("Audit Actor")).toBeInTheDocument();
        expect(screen.getByText(UUID)).toBeInTheDocument();
        expect(screen.queryByText("Unresolved")).not.toBeInTheDocument();
    });
});

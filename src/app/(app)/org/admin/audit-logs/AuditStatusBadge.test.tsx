import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@/test/utils";
import { AuditStatusBadge } from "./AuditStatusBadge";

describe("AuditStatusBadge", () => {
    afterEach(() => cleanup());

    it("renders a positive tone for a success status", () => {
        render(<AuditStatusBadge status="success" />);
        expect(screen.getByText("Success")).toHaveClass("text-(--positive)");
    });

    it("renders a negative tone for any non-success status", () => {
        render(<AuditStatusBadge status="failure" />);
        expect(screen.getByText("Failure")).toHaveClass("text-(--negative)");
    });

    it("renders a muted 'Unknown' tone when status is missing", () => {
        render(<AuditStatusBadge status={null} />);
        expect(screen.getByText("Unknown")).toHaveClass("text-(--ink-muted)");
    });

    it("is case-insensitive when detecting success", () => {
        render(<AuditStatusBadge status="SUCCESS" />);
        expect(screen.getByText("SUCCESS")).toHaveClass("text-(--positive)");
    });
});

import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { Notice } from "./Notice";

describe("Notice danger as the banners use it", () => {
    it("a client-state banner (default live) is role=alert with the Error prefix", () => {
        render(<Notice variant="danger">Failed to load repositories: boom</Notice>);
        const alert = screen.getByRole("alert");
        expect(alert).toHaveTextContent("Error: Failed to load repositories: boom");
    });
    it("a page-load banner (live=false) has no role and keeps its text", () => {
        render(
            <Notice variant="danger" live={false} centered>
                Missing reset token
            </Notice>,
        );
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByText("Missing reset token")).toBeInTheDocument();
    });
});

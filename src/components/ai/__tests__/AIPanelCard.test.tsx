import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import { AIPanelCard } from "../AIPanelCard";

describe("AIPanelCard pinned (CHAOS-7763, shared cards)", () => {
    it("has the title as an h2, the description, the children and a test id from the title", () => {
        render(
            <AIPanelCard title="Net delivery lift" description="Six signed components.">
                <p>body</p>
            </AIPanelCard>,
        );
        expect(
            screen.getByRole("heading", { level: 2, name: "Net delivery lift" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Six signed components.")).toBeInTheDocument();
        expect(screen.getByText("body")).toBeInTheDocument();
        expect(screen.getByTestId("ai-panel-net-delivery-lift")).toBeInTheDocument();
    });

    it("shows the Open evidence link only when there is a target", () => {
        const { rerender } = render(
            <AIPanelCard title="T" description="D">
                x
            </AIPanelCard>,
        );
        expect(screen.queryByRole("link", { name: "Open evidence" })).toBeNull();
        rerender(
            <AIPanelCard title="T" description="D" evidenceHref="/ai/impact/evidence">
                x
            </AIPanelCard>,
        );
        expect(screen.getByRole("link", { name: "Open evidence" })).toHaveAttribute(
            "href",
            "/ai/impact/evidence",
        );
    });
});

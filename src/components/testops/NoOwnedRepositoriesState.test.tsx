import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@/test/utils";

import { NoOwnedRepositoriesState } from "./NoOwnedRepositoriesState";

afterEach(cleanup);

describe("NoOwnedRepositoriesState", () => {
    it("says the state and draws a neutral icon, never the hourglass that reads as loading", () => {
        const { container } = render(<NoOwnedRepositoriesState />);
        expect(screen.getByText("No owned repositories")).toBeTruthy();
        const svg = container.querySelector("svg");
        expect(svg).not.toBeNull();
        const cls = svg?.getAttribute("class") ?? "";
        expect(cls).not.toMatch(/hourglass|loader|clock|timer/);
        expect(cls).toContain("lucide-folder-open");
    });

    it("keeps the compact form and its test id", () => {
        render(<NoOwnedRepositoriesState compact />);
        expect(screen.getByTestId("testops-no-owned-repositories")).toBeTruthy();
    });
});

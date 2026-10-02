import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import { PageHeader } from "./PageHeader";

describe("PageHeader title uses the scale token, not its own weight", () => {
    it("has text-h1 and no forced font weight", () => {
        render(<PageHeader title="Govern" subtitle="s" />);
        const h1 = screen.getByRole("heading", { level: 1, name: "Govern" });
        expect(h1).toHaveClass("text-h1");
        expect(h1.className).not.toMatch(/font-(semibold|bold|medium)/);
    });
});

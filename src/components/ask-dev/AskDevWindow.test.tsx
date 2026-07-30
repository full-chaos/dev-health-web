import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AskDevWindow } from "./AskDevWindow";

const askDev = vi.hoisted(() => ({
    closePanel: vi.fn(),
    openPanel: vi.fn(),
    panelMode: "closed" as const,
    setPanelMode: vi.fn(),
}));

vi.mock("./AskDevProvider", () => ({ useAskDev: () => askDev }));

describe("AskDevWindow launcher", () => {
    it("uses the Full Chaos mark in the compact accessible launcher", () => {
        const { container } = render(<AskDevWindow />);

        const launcher = screen.getByRole("button", { name: "Open Ask Dev" });
        expect(launcher).toHaveTextContent("Ask Dev");
        expect(launcher).not.toHaveTextContent("✦");
        expect(container.querySelector('img[alt=""]')).toBeInTheDocument();
    });
});

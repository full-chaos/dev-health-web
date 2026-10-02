import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AI_SETUP_PATHS } from "@/lib/admin/aiSetup";
import { AISetupTabs } from "./AISetupTabs";

let pathname: string = AI_SETUP_PATHS.byoLlm;

vi.mock("next/navigation", () => ({
    usePathname: () => pathname,
}));

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

function renderTabs(features: Record<string, boolean>) {
    return render(
        <AdminTierProvider tier="enterprise" features={features}>
            <AISetupTabs />
        </AdminTierProvider>,
    );
}

describe("AISetupTabs", () => {
    beforeEach(() => {
        pathname = AI_SETUP_PATHS.byoLlm;
    });

    it.each([
        [{ byo_llm: true }, ["BYO LLM"]],
        [{ byo_llm: false }, []],
    ] as const)("shows only independently entitled tabs for %o", (features, labels) => {
        renderTabs(features);

        // The page header (h1 "AI Setup") is the page's own AdminHeader now (CHAOS-7591).
        expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
        expect(screen.getByRole("tablist", { name: "AI Setup views" })).toBeInTheDocument();
        expect(screen.queryAllByRole("tab").map((tab) => tab.textContent)).toEqual(labels);
    });

    it("marks the deep-linked child route as the active tab", () => {
        pathname = AI_SETUP_PATHS.byoLlm;
        renderTabs({ byo_llm: true });

        expect(screen.getByRole("tab", { name: "BYO LLM" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        expect(screen.getByRole("tab", { name: "BYO LLM" })).toHaveAttribute(
            "aria-current",
            "page",
        );
    });
});

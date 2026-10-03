import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { IntegrationCredential } from "@/lib/admin/types";
import { render, screen, userEvent, within } from "@/test/utils";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/admin/server", () => ({
    createSyncConfig: vi.fn(),
    updateSyncConfig: vi.fn(),
    updateSyncConfigRepositories: vi.fn(),
    batchCreateSyncConfigs: vi.fn(),
    listReposForCredential: vi.fn(),
    testConnection: vi.fn(),
    createCredential: vi.fn(),
    getPagerDutyServices: vi.fn(),
}));
vi.mock("@/components/admin/AdminTierContext", () => ({
    useAdminTier: () => ({ tier: "community", features: {}, limits: {}, minSyncIntervalHours: 24 }),
}));
vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

import { SyncConfigForm } from "./SyncConfigForm";

const credentials: IntegrationCredential[] = [];

// CHAOS-8243: the new-sync wizard against the design: full width, the step is the section card (no card
// around a card), Cancel in the footer beside Continue, and Continue is the shared primary button.
describe("New sync configuration layout (CHAOS-8243)", () => {
    it("uses the full width and does not wrap the step section card in a second card", () => {
        const { container } = render(<SyncConfigForm credentials={credentials} />);
        const form = container.querySelector("form") as HTMLFormElement;
        expect(form.className).not.toContain("max-w-2xl");
        const body = screen.getByTestId("wizard-step-body");
        expect(body.className).not.toMatch(/border|bg-/);
        expect(within(body).getByRole("heading", { name: "Identity" })).toBeInTheDocument();
    });

    it("has Cancel in the footer next to Continue, and no Cancel at the top of a step", () => {
        render(<SyncConfigForm credentials={credentials} />);
        const cancel = screen.getByRole("link", { name: "Cancel" });
        expect(cancel).toHaveAttribute("href", "/org/admin/sync");
        const footer = screen.getByRole("button", { name: "Continue" })
            .parentElement as HTMLElement;
        expect(footer).toContainElement(cancel);
        expect(screen.getAllByRole("link", { name: "Cancel" })).toHaveLength(1);
    });

    it("draws Continue as the shared primary button", async () => {
        render(<SyncConfigForm credentials={credentials} />);
        const button = screen.getByRole("button", { name: "Continue" });
        expect(button.className).toContain("bg-(--action)");
        expect(button.className).not.toContain("bg-(--accent)");
        await userEvent.type(screen.getByLabelText("Configuration Name"), "Nightly");
        expect(button).toBeEnabled();
    });
});

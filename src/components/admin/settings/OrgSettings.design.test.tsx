import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/admin/server", () => ({
    deleteCurrentOrg: vi.fn(),
    dryRunDeleteCurrentOrg: vi.fn(),
}));

import { SettingsSection } from "@/components/settings/SettingsSection";
import { render, screen, within } from "@/test/utils";

import { DangerZone } from "./DangerZone";
import { GeneralSettings } from "./GeneralSettings";
import { SubscriptionSummaryCard } from "./billing/SubscriptionSummaryCard";

describe("Organization settings design (CHAOS-8241)", () => {
    it("draws a settings section as the shared Section; a normal one has no red edge", () => {
        render(
            <SettingsSection title="Profile" description="Manage your profile.">
                body
            </SettingsSection>,
        );
        const heading = screen.getByRole("heading", { level: 2, name: "Profile" });
        const card = heading.closest("section") as HTMLElement;
        expect(card).toHaveTextContent("Manage your profile.");
        expect(card.className).not.toContain("border-l-(--negative)");
        expect(card).not.toHaveAttribute("data-danger");
    });

    it("the Danger Zone is a neutral card with a red left edge, not a red-filled card", () => {
        render(<DangerZone orgName="Acme" />);
        const card = screen
            .getByRole("heading", { level: 2, name: "Danger Zone" })
            .closest("section") as HTMLElement;
        expect(card).toHaveAttribute("data-danger", "true");
        expect(card.className).toContain("border-l-(--negative)");
        expect(card.className).not.toContain("bg-(--negative)");
    });

    it("Delete Organization is an outline button with a trash icon, and the text says a preview comes first", () => {
        render(<DangerZone orgName="Acme" />);
        const button = screen.getByRole("button", { name: "Delete Organization" });
        expect(button.className).toContain("border-(--negative)");
        expect(button.className).not.toMatch(/(^|\s)bg-\(--negative\)/u);
        expect(button.querySelector("svg")).not.toBeNull();
        expect(
            screen.getByText(
                /A preview of what is deleted comes first; then type the organization name/,
            ),
        ).toBeInTheDocument();
    });

    it("the plan name and its status pill share one line under a caps Current plan label", () => {
        render(
            <SubscriptionSummaryCard
                planName="Community"
                statusLabel="free"
                statusClass="x"
                hasSubscription={false}
                loaded
                amount=""
                interval=""
                periodStartLabel=""
                periodEndLabel=""
                trialBanner={null}
                isPending={false}
                primaryActionLabel="Start free trial"
                onPrimaryAction={() => {}}
                onCancelClick={() => {}}
                showReactivate={false}
                onReactivate={() => {}}
            />,
        );
        const name = screen.getByText("Community");
        const row = name.parentElement as HTMLElement;
        expect(within(row).getByText("free")).toBeInTheDocument();
        expect(screen.getByText("Current plan").className).toContain("uppercase");
    });

    it("says the slug cannot be changed, and ties the hint to the read-only field (CHAOS-8255)", () => {
        render(<GeneralSettings org={{ id: "o", name: "Acme", slug: "acme" } as never} />);
        const slug = screen.getByLabelText("Slug");
        expect(slug).toBeDisabled();
        expect(screen.getByText("The slug cannot be changed.")).toBeInTheDocument();
        expect(slug).toHaveAttribute("aria-describedby", "slug-hint");
    });
});

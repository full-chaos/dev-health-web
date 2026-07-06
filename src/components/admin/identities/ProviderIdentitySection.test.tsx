import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";

import { ProviderIdentitySection } from "./ProviderIdentitySection";
import type { ProviderEntry } from "./providerIdentityUtils";

describe("ProviderIdentitySection", () => {
    it("renders an empty state when there are no rows", () => {
        render(
            <ProviderIdentitySection
                entries={[]}
                error={null}
                onEntryChangeAction={vi.fn()}
                onAddAction={vi.fn()}
                onRemoveAction={vi.fn()}
            />,
        );

        expect(screen.getByText("No provider identities linked.")).toBeInTheDocument();
    });

    it("renders a clearly labeled, discoverable remove action per row (not a bare x)", () => {
        const entries: ProviderEntry[] = [{ id: "a", provider: "github", username: "octocat" }];

        render(
            <ProviderIdentitySection
                entries={entries}
                error={null}
                onEntryChangeAction={vi.fn()}
                onAddAction={vi.fn()}
                onRemoveAction={vi.fn()}
            />,
        );

        const removeButton = screen.getByRole("button", {
            name: "Remove github identity octocat",
        });
        expect(removeButton).toHaveTextContent("Remove");
    });

    it("calls onRemoveAction with the row index when the remove button is clicked", async () => {
        const onRemoveAction = vi.fn();
        const entries: ProviderEntry[] = [
            { id: "a", provider: "github", username: "octocat" },
            { id: "b", provider: "gitlab", username: "glcat" },
        ];
        const user = userEvent.setup();

        render(
            <ProviderIdentitySection
                entries={entries}
                error={null}
                onEntryChangeAction={vi.fn()}
                onAddAction={vi.fn()}
                onRemoveAction={onRemoveAction}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Remove gitlab identity glcat" }));

        expect(onRemoveAction).toHaveBeenCalledWith(1);
    });

    it("surfaces a validation error passed from the parent form as an alert", () => {
        render(
            <ProviderIdentitySection
                entries={[]}
                error="Every provider identity needs a username."
                onEntryChangeAction={vi.fn()}
                onAddAction={vi.fn()}
                onRemoveAction={vi.fn()}
            />,
        );

        expect(screen.getByRole("alert")).toHaveTextContent(
            "Every provider identity needs a username.",
        );
    });

    it("renders no alert when there is no error", () => {
        render(
            <ProviderIdentitySection
                entries={[]}
                error={null}
                onEntryChangeAction={vi.fn()}
                onAddAction={vi.fn()}
                onRemoveAction={vi.fn()}
            />,
        );

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const askDevContextRegistrationMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/ask-dev/AskDevContextRegistration", () => ({
    AskDevContextRegistration: ({ context }: { context: unknown }) => {
        askDevContextRegistrationMock(context);
        return null;
    },
}));
vi.mock("@/components/navigation/PrimaryNav", () => ({ PrimaryNav: () => null }));
vi.mock("@/components/security/SecurityAlertQueue", () => ({
    SecurityAlertQueue: () => null,
}));

import RepoSecurityPage from "./page";

describe("repository detail Ask Dev entry point", () => {
    it("hands off only the canonical route ID and repository ID", async () => {
        const ui = await RepoSecurityPage({
            params: Promise.resolve({ repoId: "repo-opaque-id" }),
            searchParams: Promise.resolve({}),
        });
        render(ui);

        expect(
            screen.queryByRole("button", { name: "Ask Dev about this" }),
        ).not.toBeInTheDocument();
        expect(askDevContextRegistrationMock).toHaveBeenCalledWith({
            routeId: "repository_detail",
            entityRefs: [
                {
                    entity_type: "repository",
                    entity_id: "repo-opaque-id",
                    display_label: "Selected repository",
                },
            ],
            suggestedQuestionIds: ["delivery_status", "observed_change", "data_trust"],
        });
    });
});

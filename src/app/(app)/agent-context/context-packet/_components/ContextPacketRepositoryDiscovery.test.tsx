import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test/utils";

import { ContextPacketExplorer } from "./ContextPacketExplorer";

const authorizedRepository = "full-chaos/dev-health-acr";

describe("ContextPacketExplorer repository discovery", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("shows a safe discovery failure and prevents packet submission", async () => {
        const user = userEvent.setup();
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        render(
            <ContextPacketExplorer
                controlledState="sample"
                live
                repositoryCatalog={{ kind: "error" }}
            />,
        );

        expect(screen.getByTestId("repository-discovery-error")).toBeInTheDocument();
        expect(screen.getByText("Repositories could not be loaded")).toBeInTheDocument();
        expect(
            screen.getByText("Try again to load the repositories you are authorized to use."),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Generate context" })).toBeDisabled();

        await user.click(screen.getByRole("button", { name: "Generate context" }));

        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("renders an explicit empty state and prevents packet submission", async () => {
        const user = userEvent.setup();
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        render(
            <ContextPacketExplorer
                controlledState="sample"
                live
                repositoryCatalog={{ kind: "empty" }}
            />,
        );

        expect(screen.getByTestId("repository-discovery-empty")).toBeInTheDocument();
        expect(screen.getByText("No repositories are available")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Generate context" })).toBeDisabled();
        expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Generate context" }));

        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("retries repository discovery and enables a valid catalog without submitting a packet", async () => {
        const user = userEvent.setup();
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify({ repositories: [authorizedRepository] }), {
                status: 200,
            }),
        );

        render(
            <ContextPacketExplorer
                controlledState="sample"
                live
                repositoryCatalog={{ kind: "error" }}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Retry" }));

        await waitFor(() =>
            expect(screen.getByRole("combobox", { name: /Repository/ })).toHaveValue(
                authorizedRepository,
            ),
        );
        expect(screen.getByRole("button", { name: "Generate context" })).toBeEnabled();
        expect(fetchSpy).toHaveBeenCalledWith("/api/agent-context/repositories", {
            cache: "no-store",
            method: "GET",
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("keeps the safe discovery failure when retrying does not recover", async () => {
        const user = userEvent.setup();
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(new Response(null, { status: 503 }));

        render(
            <ContextPacketExplorer
                controlledState="sample"
                live
                repositoryCatalog={{ kind: "error" }}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Retry" }));

        await waitFor(() =>
            expect(screen.getByTestId("repository-discovery-error")).toBeInTheDocument(),
        );
        expect(fetchSpy).toHaveBeenCalledWith("/api/agent-context/repositories", {
            cache: "no-store",
            method: "GET",
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("button", { name: "Generate context" })).toBeDisabled();
    });
});

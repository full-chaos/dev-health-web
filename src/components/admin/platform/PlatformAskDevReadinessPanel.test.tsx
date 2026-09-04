import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlatformAskDevReadinessResponse } from "@/lib/admin/types";
import { PlatformAskDevReadinessPanel } from "./PlatformAskDevReadinessPanel";

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

const readyResponse: PlatformAskDevReadinessResponse = {
    schema_version: "platform_ask_dev_readiness.v1",
    configured: true,
    provider_label: "OpenAI compatible",
    model_label: "gpt-5-nano",
    readiness: "ready",
    readiness_checked_at: "2026-07-29T16:00:00Z",
    readiness_version: "agent-readiness.v1",
    safe_remediation: null,
};

describe("PlatformAskDevReadinessPanel", () => {
    const loadAction = vi.fn();
    const runAction = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        loadAction.mockResolvedValue({ data: readyResponse });
        runAction.mockResolvedValue({ data: readyResponse });
    });

    function renderPanel() {
        return render(
            <PlatformAskDevReadinessPanel loadAction={loadAction} runAction={runAction} />,
        );
    }

    it("shows a loading state before data resolves", () => {
        loadAction.mockReturnValue(new Promise(() => {}));
        renderPanel();
        expect(screen.getByText(/loading platform ask dev readiness/i)).toBeInTheDocument();
    });

    it("renders the platform provider identity and a Ready badge", async () => {
        renderPanel();

        expect(
            await screen.findByRole("heading", { name: "Ask Dev platform provider" }),
        ).toBeInTheDocument();
        expect(screen.getByText("OpenAI compatible")).toBeInTheDocument();
        expect(screen.getByText("gpt-5-nano")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Ready");
        expect(screen.getByText(/2026/)).toBeInTheDocument();
    });

    it("renders an error state when the load action fails", async () => {
        loadAction.mockResolvedValue({ error: "boom" });
        renderPanel();

        expect(
            await screen.findByText("Platform Ask Dev readiness is unavailable"),
        ).toBeInTheDocument();
        expect(screen.getByText("boom")).toBeInTheDocument();
    });

    it("runs the platform preflight, disables the button while running, and applies the POST response directly", async () => {
        let resolveRun: (value: { data: PlatformAskDevReadinessResponse }) => void = () => {};
        runAction.mockReturnValue(
            new Promise((resolve) => {
                resolveRun = resolve;
            }),
        );
        renderPanel();

        const button = await screen.findByRole("button", { name: "Run platform preflight" });
        fireEvent.click(button);
        expect(button).toBeDisabled();

        resolveRun({
            data: {
                ...readyResponse,
                readiness: "missing_credentials",
                safe_remediation: "Configure platform credentials via the operator environment.",
            },
        });

        await waitFor(() => expect(runAction).toHaveBeenCalledTimes(1));
        expect(await screen.findByText("Credentials required")).toBeInTheDocument();
        expect(
            screen.getByText("Configure platform credentials via the operator environment."),
        ).toBeInTheDocument();
        expect(button).not.toBeDisabled();
    });

    it("surfaces a safe failure reason and an error toast when the preflight fails", async () => {
        runAction.mockResolvedValue({ error: "Preflight timed out" });
        renderPanel();

        fireEvent.click(await screen.findByRole("button", { name: "Run platform preflight" }));

        await waitFor(() =>
            expect(screen.getByRole("alert")).toHaveTextContent("Preflight timed out"),
        );
        // The surface remains usable after a failed preflight.
        expect(screen.getByRole("button", { name: "Run platform preflight" })).not.toBeDisabled();
    });

    it("never renders BYO-specific editable fields or credential values", async () => {
        renderPanel();

        await screen.findByRole("heading", { name: "Ask Dev platform provider" });
        expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/base url/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/sk-/)).not.toBeInTheDocument();
    });

    it("renders a stale certification as a neutral, non-alarming state (CHAOS-3254 READINESS_VERSION bump), not as broken/error", async () => {
        // Genuinely stale: a real prior certification exists (readiness_checked_at
        // set, configured true) that no longer applies — distinct from
        // never_checked (no prior run) and failed (an active problem).
        loadAction.mockResolvedValue({
            data: {
                ...readyResponse,
                readiness: "stale_readiness",
                readiness_checked_at: "2026-06-01T00:00:00Z",
                safe_remediation: null,
            },
        });
        renderPanel();

        await screen.findByRole("heading", { name: "Ask Dev platform provider" });
        const badge = screen.getByRole("status");
        expect(badge).toHaveTextContent("Readiness check expired");
        // Non-alarming tone: never the negative/red dot used for a real failure.
        expect(badge.innerHTML).not.toContain("bg-(--negative)");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        // The preflight CTA remains available to re-certify.
        expect(screen.getByRole("button", { name: "Run platform preflight" })).not.toBeDisabled();
    });
});

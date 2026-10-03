import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, waitFor } from "@/test/utils";

vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => (
        <a href={href}>{children}</a>
    ),
}));

import { ByoLlmSpendSummary, type ByoLlmSpendSummaryProps } from "./ByoLlmSpendSummary";

const mockLoad = vi.fn<ByoLlmSpendSummaryProps["loadSpendAction"]>();

function renderPanel() {
    return render(<ByoLlmSpendSummary loadSpendAction={mockLoad} />);
}

describe("ByoLlmSpendSummary", () => {
    beforeEach(() => {
        mockLoad.mockReset();
    });

    it("renders the panel title and description", async () => {
        mockLoad.mockResolvedValue({
            data: { since: "2024-01-01T00:00:00Z", limit: 20, runs: [], legacy: [] },
        });
        renderPanel();

        expect(await screen.findByText("AI / LLM Spend Summary (BYO-LLM)")).toBeInTheDocument();
        expect(
            screen.getByText(
                "Per-run LLM call volume, token usage, and model for the latest runs in the last 30 days.",
            ),
        ).toBeInTheDocument();
    });

    describe("spend tiles (CHAOS-8240)", () => {
        const emptySpend = {
            data: { since: "2024-01-01T00:00:00Z", limit: 20, runs: [], legacy: [] },
        };
        const budget = (over: Record<string, unknown> = {}) => ({
            data: {
                used_micro_usd: 184_000_000,
                limit_micro_usd: 500_000_000,
                remaining_micro_usd: 316_000_000,
                window: "calendar_month_utc",
                reset_at: "2026-11-01T00:00:00Z",
                enforcement_available: true,
                reason: "available",
                maximum_limit_micro_usd: 500_000_000,
                pricing_version: "v1",
                ...over,
            },
        });

        it("opens the card with Used or reserved, Monthly limit and Remaining from the served budget", async () => {
            mockLoad.mockResolvedValue(emptySpend);
            render(
                <ByoLlmSpendSummary
                    loadSpendAction={mockLoad}
                    loadBudgetAction={async () => budget() as never}
                />,
            );
            const strip = await screen.findByTestId("byo-llm-spend-tiles");
            await waitFor(() => expect(strip).toHaveTextContent("$184.00"));
            expect(strip).toHaveTextContent("Used or reserved");
            expect(strip).toHaveTextContent("Monthly limit");
            expect(strip).toHaveTextContent("$500.00");
            expect(strip).toHaveTextContent("Remaining");
            expect(strip).toHaveTextContent("$316.00");
            expect(strip).toHaveAttribute("data-columns", "3");
        });

        it("reads Not reported, never $0, for a value the budget does not serve", async () => {
            mockLoad.mockResolvedValue(emptySpend);
            render(
                <ByoLlmSpendSummary
                    loadSpendAction={mockLoad}
                    loadBudgetAction={
                        (async () =>
                            budget({
                                limit_micro_usd: null,
                                remaining_micro_usd: null,
                            })) as never
                    }
                />,
            );
            const strip = await screen.findByTestId("byo-llm-spend-tiles");
            await waitFor(() => expect(strip).toHaveTextContent("$184.00"));
            expect(strip.textContent?.match(/Not reported/g)).toHaveLength(2);
            expect(strip).not.toHaveTextContent("$0.00");
        });

        it("has no tiles without a budget action, or when the budget cannot be read", async () => {
            mockLoad.mockResolvedValue(emptySpend);
            const first = render(<ByoLlmSpendSummary loadSpendAction={mockLoad} />);
            await screen.findByText("AI / LLM Spend Summary (BYO-LLM)");
            expect(screen.queryByTestId("byo-llm-spend-tiles")).not.toBeInTheDocument();
            first.unmount();
            render(
                <ByoLlmSpendSummary
                    loadSpendAction={mockLoad}
                    loadBudgetAction={async () => ({ error: "nope", status: 500 }) as never}
                />,
            );
            await screen.findByText("AI / LLM Spend Summary (BYO-LLM)");
            expect(screen.queryByTestId("byo-llm-spend-tiles")).not.toBeInTheDocument();
        });
    });

    it("draws the runs as a bordered table with a caps header band (CHAOS-8240)", async () => {
        mockLoad.mockResolvedValue({
            data: {
                since: "2024-01-01T00:00:00Z",
                limit: 20,
                runs: [
                    {
                        run_id: "run-1",
                        calls: 42,
                        input_tokens: 12345,
                        output_tokens: 6789,
                        model: "gpt-4o",
                        failures_by_class: {},
                    },
                ],
                legacy: [],
            },
        });
        renderPanel();
        const table = await screen.findByTestId("byo-llm-spend-table");
        expect(table.parentElement?.className).toContain("border-(--card-stroke)");
        expect(table.querySelector("thead")?.className).toContain("uppercase");
        expect(table).toHaveTextContent("12,345");
    });

    it("renders per-run rows with calls, tokens, model, and failures-by-class", async () => {
        mockLoad.mockResolvedValue({
            data: {
                since: "2024-01-01T00:00:00Z",
                limit: 20,
                runs: [
                    {
                        run_id: "run-1",
                        calls: 42,
                        input_tokens: 12345,
                        output_tokens: 6789,
                        model: "gpt-4o",
                        failures_by_class: { llm_error: 2, low_confidence: 1 },
                    },
                    {
                        run_id: "run-2",
                        calls: 10,
                        input_tokens: 1000,
                        output_tokens: 500,
                        model: null,
                        failures_by_class: {},
                    },
                ],
                legacy: [],
            },
        });
        renderPanel();

        await screen.findByText("run-1");
        expect(screen.getByText("gpt-4o")).toBeInTheDocument();
        expect(screen.getByText("42")).toBeInTheDocument();
        expect(screen.getByText("12,345")).toBeInTheDocument();
        expect(screen.getByText("6,789")).toBeInTheDocument();
        expect(screen.getByText("llm_error ×2")).toBeInTheDocument();
        expect(screen.getByText("low_confidence ×1")).toBeInTheDocument();

        // Second row: no model, no failures.
        expect(screen.getByText("run-2")).toBeInTheDocument();
        expect(screen.getAllByText("—").length).toBeGreaterThan(0);
        expect(screen.getByText("None")).toBeInTheDocument();

        // Categorization-outcome disclaimer is always shown alongside populated data.
        expect(
            screen.getByText(/persisted categorization outcomes/i, { exact: false }),
        ).toBeInTheDocument();
    });

    it("renders an empty state when there is no spend and no legacy rows", async () => {
        mockLoad.mockResolvedValue({
            data: { since: "2024-01-01T00:00:00Z", limit: 20, runs: [], legacy: [] },
        });
        renderPanel();

        expect(await screen.findByText("No BYO-LLM spend recorded yet")).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("renders a legacy state when spend exists but predates per-run tracking", async () => {
        mockLoad.mockResolvedValue({
            data: {
                since: "2024-01-01T00:00:00Z",
                limit: 20,
                runs: [],
                legacy: [
                    {
                        run_id: "",
                        marker: "legacy_empty_run_id",
                        provider: "openai",
                        model: "gpt-4o",
                        calls: 3,
                        input_tokens: 500,
                        output_tokens: 100,
                        computed_at: "2023-12-01T00:00:00Z",
                    },
                ],
            },
        });
        renderPanel();

        expect(
            await screen.findByText("Legacy spend not attributable to a run"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("byo-llm-spend-legacy")).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
        expect(screen.queryByText("No BYO-LLM spend recorded yet")).not.toBeInTheDocument();
    });

    it("renders a locked upsell state when the backend returns 402", async () => {
        mockLoad.mockResolvedValue({
            error: "This feature requires the Team plan.",
            status: 402,
        });
        renderPanel();

        expect(await screen.findByTestId("byo-llm-spend-locked")).toBeInTheDocument();
        expect(screen.getByText("This feature requires the Team plan.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Upgrade plan" })).toBeInTheDocument();
    });

    it("renders a locked state without an upgrade link when the flag is off (403)", async () => {
        mockLoad.mockResolvedValue({
            error: "BYO LLM is not enabled for this organization",
            status: 403,
        });
        renderPanel();

        expect(await screen.findByTestId("byo-llm-spend-locked")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Upgrade plan" })).not.toBeInTheDocument();
    });

    it("shows a retry action on a generic load error", async () => {
        mockLoad.mockResolvedValueOnce({ error: "temporary backend failure", status: 500 });
        mockLoad.mockResolvedValueOnce({
            data: { since: "2024-01-01T00:00:00Z", limit: 20, runs: [], legacy: [] },
        });
        renderPanel();

        expect(await screen.findByText("temporary backend failure")).toBeInTheDocument();
        const retryButton = screen.getByRole("button", { name: "Retry" });

        await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(1));
        await userEvent.click(retryButton);

        await waitFor(() => {
            expect(screen.getByText("No BYO-LLM spend recorded yet")).toBeInTheDocument();
        });
        expect(mockLoad).toHaveBeenCalledTimes(2);
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderWithToaster, screen, userEvent, waitFor, within } from "@/test/utils";

vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => (
        <a href={href}>{children}</a>
    ),
}));

import { BYO_LLM_CONFIG_CHANGED } from "@/lib/admin/byoLlmConfigChanges";
import { CTA_LABELS } from "@/lib/design/cta";
import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import { LLM_SETTINGS_UNDECRYPTABLE, type LLMSettingsActionResult } from "@/lib/admin/types";
import { ByoLlmCategorizeOptIn } from "./ByoLlmCategorizeOptIn";
import { ByoLlmPurposeOverrides } from "./ByoLlmPurposeOverrides";
import { ByoLlmSpendSummary, SPEND_UNREADABLE } from "./ByoLlmSpendSummary";
import { ByoLlmSettings, type ByoLlmSettingsProps } from "./ByoLlmSettings";

// The card's words, as a contract (UNREADABLE_COPY in ByoLlmSettings.tsx).
const COPY = {
    message: "The saved key can no longer be read. Replace or remove it.",
    replace: "Replace",
    remove: "Remove",
    confirmRemove: "Confirm remove?",
    removed: "BYO-LLM settings removed.",
};

/**
 * CHAOS-12173: saved BYO settings whose key the configured encryption key cannot read (go-api 409
 * llm_settings_undecryptable, CHAOS-12172). The card says so and offers Replace and Remove; a
 * transient read failure still offers Retry only.
 */
const mockLoad = vi.fn<ByoLlmSettingsProps["loadSettingsAction"]>();
const mockLoadBudget = vi.fn<ByoLlmSettingsProps["loadBudgetAction"]>();
const mockLoadStatus = vi.fn<ByoLlmSettingsProps["loadStatusAction"]>();
const mockSave = vi.fn<ByoLlmSettingsProps["saveSettingsAction"]>();
const mockRemove = vi.fn<ByoLlmSettingsProps["removeSettingsAction"]>();
const mockRemovePurpose = vi.fn<NonNullable<ByoLlmSettingsProps["removePurposeAction"]>>();
const mockRunReadiness = vi.fn<ByoLlmSettingsProps["runReadinessAction"]>();

const UNREADABLE = (purposes: string[]): LLMSettingsActionResult<never> => ({
    error: READ_FAILED_MESSAGE,
    status: 409,
    code: LLM_SETTINGS_UNDECRYPTABLE,
    purposes,
});
const TRANSIENT: LLMSettingsActionResult<never> = { error: READ_FAILED_MESSAGE, status: 500 };

function renderCard() {
    return renderWithToaster(
        <ByoLlmSettings
            loadSettingsAction={mockLoad}
            loadBudgetAction={mockLoadBudget}
            loadStatusAction={mockLoadStatus}
            saveSettingsAction={mockSave}
            removeSettingsAction={mockRemove}
            removePurposeAction={mockRemovePurpose}
            runReadinessAction={mockRunReadiness}
        />,
    );
}

describe("ByoLlmSettings with saved settings that cannot be read", () => {
    beforeEach(() => {
        for (const mock of [
            mockLoad,
            mockLoadBudget,
            mockLoadStatus,
            mockSave,
            mockRemove,
            mockRemovePurpose,
            mockRunReadiness,
        ]) {
            mock.mockReset();
        }
        mockLoadStatus.mockResolvedValue({ error: "Not implemented", status: 501 });
        mockLoadBudget.mockResolvedValue({ error: "Not implemented", status: 501 });
        mockRemove.mockResolvedValue({ data: { deleted: true } });
        mockRemovePurpose.mockImplementation(async (purpose) => ({
            data: { deleted: true, purpose },
        }));
    });

    it("says the key can no longer be read and offers Replace and Remove, not Retry", async () => {
        mockLoad.mockResolvedValue(UNREADABLE(["explain"]));
        renderCard();
        const notice = await screen.findByTestId("byo-llm-unreadable");
        expect(notice).toHaveTextContent(COPY.message);
        expect(within(notice).getByTestId("byo-llm-unreadable-scope")).toHaveTextContent(
            "The default configuration or the Explanations model override cannot be read.",
        );
        expect(within(notice).getByRole("button", { name: COPY.replace })).toBeInTheDocument();
        expect(within(notice).getByRole("button", { name: COPY.remove })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: CTA_LABELS.retry })).not.toBeInTheDocument();
        expect(screen.queryByText(READ_FAILED_MESSAGE)).not.toBeInTheDocument();
    });

    it("a transient read failure still offers Retry only", async () => {
        mockLoad.mockResolvedValue(TRANSIENT);
        renderCard();
        expect(await screen.findByRole("button", { name: CTA_LABELS.retry })).toBeInTheDocument();
        expect(screen.queryByTestId("byo-llm-unreadable")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: COPY.remove })).not.toBeInTheDocument();
    });

    it("Remove asks once, then removes the default settings and each named override, then reads again", async () => {
        mockLoad
            .mockResolvedValueOnce(
                UNREADABLE(["investigate", "explain", "categorize", "planted_purpose"]),
            )
            .mockResolvedValue({ data: {} });
        const changed = vi.fn();
        window.addEventListener(BYO_LLM_CONFIG_CHANGED, changed);
        renderCard();
        const user = userEvent.setup();
        await user.click(await screen.findByRole("button", { name: COPY.remove }));
        expect(mockRemove).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: COPY.confirmRemove }));
        await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
        expect(mockRemove).toHaveBeenCalledTimes(1);
        // Every purpose the 409 names, categorize included (codex r2 on #1630); an unknown id is never sent.
        expect(mockRemovePurpose.mock.calls.map(([purpose]) => purpose)).toEqual([
            "investigate",
            "explain",
            "categorize",
        ]);
        expect(changed).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId("byo-llm-unreadable")).not.toBeInTheDocument();
        expect(await screen.findByText(COPY.removed)).toBeInTheDocument();
        window.removeEventListener(BYO_LLM_CONFIG_CHANGED, changed);
    });

    it("names a categorize override in the scope sentence", async () => {
        mockLoad.mockResolvedValue(UNREADABLE(["categorize"]));
        renderCard();
        expect(await screen.findByTestId("byo-llm-unreadable-scope")).toHaveTextContent(
            "The default configuration or the Categorization model override cannot be read.",
        );
    });

    // codex r2 on #1630: a served 4xx text must not reach the card.
    it("a failed remove shows the card's own words, never the served text", async () => {
        mockLoad.mockResolvedValue(UNREADABLE(["explain"]));
        mockRemove.mockResolvedValue({
            error: "served: purpose_not_configurable categorize",
            status: 409,
            code: "x",
        });
        renderCard();
        const user = userEvent.setup();
        await user.click(await screen.findByRole("button", { name: COPY.remove }));
        await user.click(screen.getByRole("button", { name: COPY.confirmRemove }));
        const notice = await screen.findByTestId("byo-llm-unreadable");
        const alert = await within(notice).findByRole("alert");
        expect(alert).toHaveTextContent("Could not remove BYO-LLM settings.");
        expect(notice.textContent).not.toContain("served:");
    });

    it("a failed remove says so and keeps the notice", async () => {
        mockLoad.mockResolvedValue(UNREADABLE([]));
        mockRemove.mockResolvedValue({
            error: "The change was not saved. Try again.",
            status: 500,
        });
        renderCard();
        const user = userEvent.setup();
        await user.click(await screen.findByRole("button", { name: COPY.remove }));
        await user.click(screen.getByRole("button", { name: COPY.confirmRemove }));
        const notice = await screen.findByTestId("byo-llm-unreadable");
        expect(await within(notice).findByRole("alert")).toHaveTextContent(
            "Could not remove BYO-LLM settings.",
        );
        expect(mockLoad).toHaveBeenCalledTimes(1);
        expect(mockRemovePurpose).not.toHaveBeenCalled();
    });

    it("an override already gone (404) still counts as removed", async () => {
        mockLoad.mockResolvedValueOnce(UNREADABLE(["explain"])).mockResolvedValue({ data: {} });
        mockRemovePurpose.mockResolvedValue({ error: "Could not be read", status: 404 });
        renderCard();
        const user = userEvent.setup();
        await user.click(await screen.findByRole("button", { name: COPY.remove }));
        await user.click(screen.getByRole("button", { name: COPY.confirmRemove }));
        await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
        expect(screen.queryByTestId("byo-llm-unreadable")).not.toBeInTheDocument();
    });

    // codex r1 on #1630: the unreadable branch left the budget loading, so Replace showed it disabled.
    it("Replace leaves the monthly budget editable", async () => {
        mockLoad.mockResolvedValue(UNREADABLE([]));
        mockLoadBudget.mockResolvedValue({
            data: {
                used_micro_usd: 0,
                limit_micro_usd: null,
                remaining_micro_usd: null,
                window: "calendar_month_utc",
                reset_at: "2026-08-01T00:00:00Z",
                enforcement_available: false,
            } as never,
        });
        renderCard();
        const user = userEvent.setup();
        await user.click(await screen.findByRole("button", { name: COPY.replace }));
        await waitFor(() => expect(document.getElementById("byo-budget-usd")).toBeEnabled());
    });

    it("Replace opens the empty setup form, which takes a new key", async () => {
        mockLoad.mockResolvedValue(UNREADABLE([]));
        renderCard();
        const user = userEvent.setup();
        await user.click(await screen.findByRole("button", { name: COPY.replace }));
        expect(screen.queryByTestId("byo-llm-unreadable")).not.toBeInTheDocument();
        const key = screen.getByLabelText(/api key/i);
        expect(key).toHaveValue("");
        expect(mockRemove).not.toHaveBeenCalled();
    });
});

describe("ByoLlmPurposeOverrides with saved settings that cannot be read", () => {
    it("shows nothing: the default section owns the notice", async () => {
        const load = vi.fn().mockResolvedValue(UNREADABLE(["explain"]));
        const { container } = render(
            <ByoLlmPurposeOverrides
                loadSettingsAction={load}
                saveAction={vi.fn()}
                removeAction={vi.fn()}
            />,
        );
        await waitFor(() => expect(load).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
        expect(screen.queryByRole("button", { name: CTA_LABELS.retry })).not.toBeInTheDocument();
    });

    it("reads again when the default section changes the config", async () => {
        const load = vi.fn().mockResolvedValue(UNREADABLE(["explain"]));
        render(
            <ByoLlmPurposeOverrides
                loadSettingsAction={load}
                saveAction={vi.fn()}
                removeAction={vi.fn()}
            />,
        );
        await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
        window.dispatchEvent(new Event(BYO_LLM_CONFIG_CHANGED));
        await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    });
});

describe("the other BYO cards stay quiet when the saved key cannot be read", () => {
    it("categorization: shows nothing, and reads again when the config changes", async () => {
        const load = vi.fn().mockResolvedValue(UNREADABLE([]));
        const { container } = render(
            <ByoLlmCategorizeOptIn loadSettingsAction={load} saveAction={vi.fn()} />,
        );
        await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
        expect(container).toBeEmptyDOMElement();
        window.dispatchEvent(new Event(BYO_LLM_CONFIG_CHANGED));
        await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    });

    it("categorization: a transient failure still offers Retry", async () => {
        const load = vi.fn().mockResolvedValue(TRANSIENT);
        render(<ByoLlmCategorizeOptIn loadSettingsAction={load} saveAction={vi.fn()} />);
        expect(await screen.findByRole("button", { name: CTA_LABELS.retry })).toBeInTheDocument();
    });

    it("spend: says it shows again once the key is fixed, no Retry, and reads again on a config change", async () => {
        const loadSpend = vi.fn().mockResolvedValue(UNREADABLE([]));
        render(<ByoLlmSpendSummary loadSpendAction={loadSpend} />);
        expect(await screen.findByTestId("byo-llm-spend-unreadable")).toHaveTextContent(
            SPEND_UNREADABLE,
        );
        expect(screen.queryByRole("button", { name: CTA_LABELS.retry })).not.toBeInTheDocument();
        loadSpend.mockResolvedValue({ data: { runs: [], unattributed: [] } });
        window.dispatchEvent(new Event(BYO_LLM_CONFIG_CHANGED));
        await waitFor(() => expect(loadSpend).toHaveBeenCalledTimes(2));
        await waitFor(() =>
            expect(screen.queryByTestId("byo-llm-spend-unreadable")).not.toBeInTheDocument(),
        );
    });

    it("spend: a transient failure still offers Retry", async () => {
        const loadSpend = vi.fn().mockResolvedValue(TRANSIENT);
        render(<ByoLlmSpendSummary loadSpendAction={loadSpend} />);
        expect(await screen.findByRole("button", { name: CTA_LABELS.retry })).toBeInTheDocument();
    });
});

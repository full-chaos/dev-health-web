import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AskDevSurfaceContext } from "@/lib/dev/contextualEntryPoints";

import { AskDevTrigger } from "./AskDevTrigger";

const askDev = vi.hoisted(() => ({
    contextualEntrypointsEnabled: true,
    openPanel: vi.fn(),
    setProposedContext: vi.fn(),
    submitQuestion: vi.fn(),
}));
const trackTelemetryEvent = vi.hoisted(() => vi.fn());

vi.mock("./AskDevProvider", () => ({ useOptionalAskDev: () => askDev }));
vi.mock("@/lib/telemetry", () => ({ trackTelemetryEvent }));

const context: AskDevSurfaceContext = {
    routeId: "issue_detail",
    entityRefs: [
        {
            entity_type: "issue",
            entity_id: "CHAOS-3216",
            display_label: "CHAOS-3216",
        },
    ],
    suggestedQuestionIds: ["remaining_work"],
};

describe("AskDevTrigger", () => {
    beforeEach(() => {
        askDev.contextualEntrypointsEnabled = true;
        askDev.openPanel.mockClear();
        askDev.setProposedContext.mockClear();
        askDev.submitQuestion.mockClear();
        trackTelemetryEvent.mockClear();
    });

    it("hands off typed context and opens the shared window without submitting", async () => {
        const user = userEvent.setup();
        render(<AskDevTrigger context={context} />);

        await user.click(screen.getByRole("button", { name: "Ask Dev about this" }));

        expect(askDev.setProposedContext).toHaveBeenCalledWith(context);
        expect(askDev.openPanel).toHaveBeenCalledOnce();
        expect(askDev.submitQuestion).not.toHaveBeenCalled();
        expect(trackTelemetryEvent).toHaveBeenCalledWith("feature_viewed", {
            feature: "ask_dev_contextual_entrypoint",
            surface: "issue_detail",
            routePattern: "issue_detail",
        });
    });

    it("is independently hidden while the permanent window can remain mounted", () => {
        askDev.contextualEntrypointsEnabled = false;
        render(<AskDevTrigger context={context} />);

        expect(
            screen.queryByRole("button", { name: "Ask Dev about this" }),
        ).not.toBeInTheDocument();
        expect(askDev.openPanel).not.toHaveBeenCalled();
    });

    it("fails closed when serialized context contains raw page content", () => {
        const unsafeContext = {
            ...context,
            entityRefs: [
                {
                    entity_type: "issue",
                    entity_id: "CHAOS-3216",
                    display_label: "<article>rendered page content</article>",
                },
            ],
        } as AskDevSurfaceContext;

        render(<AskDevTrigger context={unsafeContext} />);

        expect(
            screen.queryByRole("button", { name: "Ask Dev about this" }),
        ).not.toBeInTheDocument();
        expect(askDev.setProposedContext).not.toHaveBeenCalled();
    });
});

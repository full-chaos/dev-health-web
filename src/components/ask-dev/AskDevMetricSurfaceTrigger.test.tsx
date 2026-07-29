import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";

import { AskDevMetricSurfaceTrigger } from "./AskDevMetricSurfaceTrigger";

const askDevTriggerMock = vi.hoisted(() => vi.fn());
vi.mock("./AskDevTrigger", () => ({
    AskDevTrigger: ({ context }: { context: unknown }) => {
        askDevTriggerMock(context);
        return <button type="button">Ask Dev about this</button>;
    },
}));

describe("AskDevMetricSurfaceTrigger", () => {
    afterEach(() => {
        cleanup();
        askDevTriggerMock.mockReset();
    });

    it.each([
        "diagnose_overview",
        "flow_metrics",
        "investment",
        "cognitive_load",
        "bottlenecks",
    ] as const)("builds typed %s context from the canonical filter", (routeId) => {
        render(<AskDevMetricSurfaceTrigger filters={defaultMetricFilter} routeId={routeId} />);

        expect(askDevTriggerMock).toHaveBeenCalledWith(
            expect.objectContaining({
                routeId,
                entityRefs: [],
                filterFingerprint: expect.stringMatching(/^filter-v1-[a-f0-9]{8}$/),
            }),
        );
    });

    it("enables complexity only with a canonical repository selection", () => {
        const filters = {
            ...defaultMetricFilter,
            scope: { level: "repo" as const, ids: ["repo-1"] },
        };
        const rendered = render(
            <AskDevMetricSurfaceTrigger filters={defaultMetricFilter} routeId="complexity" />,
        );
        expect(askDevTriggerMock).not.toHaveBeenCalled();

        rendered.rerender(<AskDevMetricSurfaceTrigger filters={filters} routeId="complexity" />);
        expect(askDevTriggerMock).toHaveBeenCalledWith(
            expect.objectContaining({
                routeId: "complexity",
                entityRefs: [
                    {
                        entity_type: "repository",
                        entity_id: "repo-1",
                        display_label: "Selected repository",
                    },
                ],
            }),
        );
    });
});

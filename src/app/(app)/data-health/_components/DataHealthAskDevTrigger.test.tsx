import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const askDevTriggerMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/ask-dev/AskDevTrigger", () => ({
    AskDevTrigger: ({ context }: { context: unknown }) => {
        askDevTriggerMock(context);
        return <button type="button">Ask Dev about this</button>;
    },
}));

import { DataHealthAskDevTrigger } from "./DataHealthAskDevTrigger";

describe("DataHealthAskDevTrigger", () => {
    it("uses organization/source-health context without connector page content", () => {
        render(<DataHealthAskDevTrigger />);

        expect(askDevTriggerMock).toHaveBeenCalledWith({
            routeId: "data_health",
            entityRefs: [],
            suggestedQuestionIds: ["data_trust", "observed_change"],
        });
    });
});

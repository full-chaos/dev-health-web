import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import AgentContextIndexPage from "./page";

describe("AgentContextIndexPage", () => {
    beforeEach(() => {
        redirectMock.mockClear();
    });

    it("redirects /agent-context to the context packet page", () => {
        AgentContextIndexPage();
        expect(redirectMock).toHaveBeenCalledWith("/agent-context/context-packet");
    });
});

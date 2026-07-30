import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AskDevSurfaceContext } from "@/lib/dev/contextualEntryPoints";

import { AskDevContextRegistration } from "./AskDevContextRegistration";

const askDev = vi.hoisted(() => ({
    contextualEntrypointsEnabled: true,
    proposedContext: null as AskDevSurfaceContext | null,
    clearProposedContext: vi.fn<() => void>(),
    setProposedContext: vi.fn<(context: AskDevSurfaceContext) => void>(),
}));

vi.mock("./AskDevProvider", () => ({ useOptionalAskDev: () => askDev }));

const issueContext: AskDevSurfaceContext = {
    routeId: "issue_detail",
    entityRefs: [
        {
            entity_type: "issue",
            entity_id: "CHAOS-3247",
            display_label: "CHAOS-3247",
        },
    ],
    suggestedQuestionIds: ["remaining_work"],
};

const repositoryContext: AskDevSurfaceContext = {
    routeId: "repository_detail",
    entityRefs: [
        {
            entity_type: "repository",
            entity_id: "repo-1",
            display_label: "full-chaos/dev-health-web",
        },
    ],
};

describe("AskDevContextRegistration", () => {
    beforeEach(() => {
        askDev.contextualEntrypointsEnabled = true;
        askDev.proposedContext = null;
        askDev.clearProposedContext.mockReset();
        askDev.setProposedContext.mockReset();
        askDev.setProposedContext.mockImplementation((context) => {
            askDev.proposedContext = context;
        });
        askDev.clearProposedContext.mockImplementation(() => {
            askDev.proposedContext = null;
        });
    });

    it("registers approved context without rendering a control", () => {
        const { container } = render(<AskDevContextRegistration context={issueContext} />);

        expect(container).toBeEmptyDOMElement();
        expect(askDev.setProposedContext).toHaveBeenCalledOnce();
        expect(askDev.setProposedContext).toHaveBeenCalledWith(
            expect.objectContaining({ routeId: "issue_detail" }),
        );
    });

    it("updates the registered context without clearing the handoff", () => {
        const rendered = render(<AskDevContextRegistration context={issueContext} />);

        rendered.rerender(<AskDevContextRegistration context={repositoryContext} />);

        expect(askDev.clearProposedContext).not.toHaveBeenCalled();
        expect(askDev.setProposedContext).toHaveBeenLastCalledWith(
            expect.objectContaining({ routeId: "repository_detail" }),
        );
    });

    it("preserves the registered proposal when the page unmounts for the /dev handoff", () => {
        const rendered = render(<AskDevContextRegistration context={issueContext} />);
        const registeredContext = askDev.setProposedContext.mock.calls[0]?.[0];

        rendered.unmount();

        expect(askDev.clearProposedContext).not.toHaveBeenCalled();
        expect(askDev.proposedContext).toBe(registeredContext);
    });

    it("fails closed for unapproved context or a disabled contextual-entrypoint policy", () => {
        const unsafeContext = {
            ...issueContext,
            pageContent: "raw page content",
        } as AskDevSurfaceContext;
        const rendered = render(<AskDevContextRegistration context={unsafeContext} />);

        expect(askDev.setProposedContext).not.toHaveBeenCalled();

        askDev.contextualEntrypointsEnabled = false;
        rendered.rerender(<AskDevContextRegistration context={issueContext} />);
        expect(askDev.setProposedContext).not.toHaveBeenCalled();
    });
});

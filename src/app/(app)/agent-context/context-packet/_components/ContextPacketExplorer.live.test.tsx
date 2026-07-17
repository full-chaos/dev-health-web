import { expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, render, screen } from "@/test/utils";
import { SAMPLE_CONTEXT_PACKET } from "./samplePacket";
import { ContextPacketExplorer } from "./ContextPacketExplorer";

it("keeps the newest live packet when a delayed earlier response resolves last", async () => {
    const user = userEvent.setup();
    let resolveStaleResponse: ((response: Response) => void) | undefined;
    let markStaleResponseProcessed: (() => void) | undefined;
    const staleResponseProcessed = new Promise<void>((resolve) => {
        markStaleResponseProcessed = resolve;
    });
    const staleResponse = new Promise<Response>((resolve) => {
        resolveStaleResponse = resolve;
    });
    const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementationOnce(() => staleResponse)
        .mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    ...SAMPLE_CONTEXT_PACKET,
                    context_packet_id: "packet-current",
                    goal: "Current Context Fabric request",
                }),
                { status: 200 },
            ),
        );
    render(
        <ContextPacketExplorer
            controlledState="sample"
            live
            repositories={["full-chaos/dev-health-acr"]}
        />,
    );

    const goal = screen.getByLabelText(/Goal/);
    const generate = screen.getByRole("button", { name: "Generate context" });
    await user.type(goal, "Delayed Context Fabric request");
    await user.click(generate);

    expect(generate).toBeEnabled();

    await user.clear(goal);
    await user.type(goal, "Current Context Fabric request");
    await user.click(generate);
    await expect(
        screen.getByRole("heading", { name: "Current Context Fabric request" }),
    ).toBeVisible();

    if (resolveStaleResponse === undefined) throw new Error("The delayed request did not start.");
    if (markStaleResponseProcessed === undefined)
        throw new Error("The stale response processing barrier did not initialize.");
    const resolveDelayedResponse = resolveStaleResponse;
    const markResponseProcessed = markStaleResponseProcessed;
    const delayedResponse = new Response(
        JSON.stringify({
            ...SAMPLE_CONTEXT_PACKET,
            context_packet_id: "packet-stale",
            goal: "Delayed Context Fabric request",
        }),
        { status: 200 },
    );
    const readResponse = delayedResponse.json.bind(delayedResponse);
    vi.spyOn(delayedResponse, "json").mockImplementation(async () => {
        const payload = await readResponse();
        markResponseProcessed();
        return payload;
    });
    await act(async () => {
        resolveDelayedResponse(delayedResponse);
        await staleResponseProcessed;
    });

    await expect(
        screen.getByRole("heading", { name: "Current Context Fabric request" }),
    ).toBeVisible();
    expect(
        screen.queryByRole("heading", { name: "Delayed Context Fabric request" }),
    ).not.toBeInTheDocument();
    fetchSpy.mockRestore();
});

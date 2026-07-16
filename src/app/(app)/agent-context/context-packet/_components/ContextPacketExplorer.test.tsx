import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test/utils";
import type { ACRExpandedEvidenceV1 } from "@/lib/acr/generated";

import { ContextPacketCategoryGroups } from "./ContextPacketCategoryGroups";
import { ContextPacketDetails } from "./ContextPacketDetails";
import { ContextPacketExplorer } from "./ContextPacketExplorer";
import { resetEvidenceRequestRegistryForTests } from "./evidenceRequestRegistry";
import { SAMPLE_CONTEXT_PACKET, SAMPLE_EXPANDED_EVIDENCE } from "./samplePacket";

describe("ContextPacketExplorer", () => {
    afterEach(() => {
        resetEvidenceRequestRegistryForTests();
        vi.restoreAllMocks();
    });
    it("renders the deterministic sample packet in the prescribed category order", () => {
        render(<ContextPacketExplorer controlledState="sample" />);

        expect(screen.getByRole("heading", { name: "Context Fabric" })).toBeInTheDocument();
        expect(screen.queryByText("Context Packet")).not.toBeInTheDocument();
        expect(screen.getByLabelText(/Goal/)).toHaveValue("Add repository-scoped ACR credentials");
        expect(screen.getByLabelText(/Goal.*required/)).toBeRequired();
        expect(screen.getByLabelText(/Repository.*required/)).toBeRequired();
        for (const category of ["State", "Pressure", "Cause", "Evidence", "Action"]) {
            expect(screen.getByRole("heading", { name: category, level: 2 })).toBeInTheDocument();
        }
        expect(screen.getByText("Context Fabric status")).toBeInTheDocument();
        expect(screen.queryByText("Packet status")).not.toBeInTheDocument();
        expect(
            screen.getByRole("region", { name: "Context Fabric diagnostics" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Freshness")).toBeInTheDocument();
        expect(screen.getByText("Coverage")).toBeInTheDocument();
        expect(screen.getByText("Budget")).toBeInTheDocument();
        expect(screen.getByText("Coverage is complete.")).toBeInTheDocument();
    });

    it("completes a sample request and restores focus to the generated packet", async () => {
        const user = userEvent.setup();
        render(<ContextPacketExplorer controlledState="sample" />);

        const goal = screen.getByLabelText(/Goal/);
        await user.clear(goal);
        await user.type(goal, "Inspect repository access boundaries");
        await user.click(screen.getByRole("button", { name: "Generate context" }));

        expect(goal).toHaveValue("Inspect repository access boundaries");
        await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());
        expect(screen.getByRole("button", { name: "Generate context" })).toBeEnabled();
    });

    it("validates required fields and renders the submitted goal in the packet", async () => {
        const user = userEvent.setup();
        render(<ContextPacketExplorer controlledState="sample" />);
        const goal = screen.getByLabelText(/Goal/);
        await user.clear(goal);
        await user.click(screen.getByRole("button", { name: "Generate context" }));
        expect(goal).toHaveFocus();
        expect(goal).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByText("Goal is required.")).toBeInTheDocument();
        await user.type(goal, "Review constrained credentials");
        await user.click(screen.getByRole("button", { name: "Generate context" }));
        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "Review constrained credentials" }),
            ).toBeInTheDocument(),
        );
    });

    it("clears the associated goal error when the focused invalid field becomes valid", async () => {
        const user = userEvent.setup();
        render(<ContextPacketExplorer controlledState="sample" />);
        const goal = screen.getByLabelText(/Goal/);

        await user.clear(goal);
        await user.click(screen.getByRole("button", { name: "Generate context" }));

        expect(goal).toHaveAttribute("aria-describedby", "context-goal-error");
        await user.type(goal, "Review the authorized repository scope");

        expect(goal).toHaveAttribute("aria-invalid", "false");
        expect(goal).not.toHaveAttribute("aria-describedby");
        expect(screen.queryByText("Goal is required.")).not.toBeInTheDocument();
    });

    it("limits repository selection to the server-authorized options", () => {
        render(<ContextPacketExplorer controlledState="sample" />);

        expect(screen.getByRole("combobox", { name: /Repository/ })).toHaveValue(
            "full-chaos/dev-health-acr",
        );
        expect(
            screen.getByRole("option", { name: "full-chaos/dev-health-acr" }),
        ).toBeInTheDocument();
    });

    it("renders packet diagnostics, checks, and next steps without collapsing contract data", () => {
        render(<ContextPacketExplorer controlledState="sample" />);

        expect(screen.getByText(/linear: fresh/)).toBeInTheDocument();
        expect(screen.getByText(/4,?210 serialized bytes/)).toBeInTheDocument();
        expect(screen.getByText("Test cross-repository denial")).toBeInTheDocument();
        expect(screen.getByText("Implement hashed fcacr_ bearer tokens")).toBeInTheDocument();
    });

    it("discloses the sanitized evidence fields for observed claims", async () => {
        const user = userEvent.setup();
        render(<ContextPacketExplorer controlledState="sample" />);

        await user.click(screen.getByRole("button", { name: "Open evidence" }));

        expect(screen.getByText("Credential authorization review")).toBeInTheDocument();
        expect(screen.getByText("Repository credential requirements")).toBeInTheDocument();
        expect(screen.getByText(/Evidence is available/)).toBeInTheDocument();
    });

    it("renders retrieved markup as inert text and blocks unsafe evidence links", async () => {
        const user = userEvent.setup();
        const evidence: ACRExpandedEvidenceV1 = {
            ...SAMPLE_EXPANDED_EVIDENCE.ev_01J0ACR001,
            evidence: {
                ...SAMPLE_EXPANDED_EVIDENCE.ev_01J0ACR001.evidence,
                citation: "<img src=x onerror=alert(1)>",
                source: {
                    ...SAMPLE_EXPANDED_EVIDENCE.ev_01J0ACR001.evidence.source,
                    safe_uri: "javascript:alert(1)",
                },
            },
        };

        render(
            <ContextPacketCategoryGroups
                packet={SAMPLE_CONTEXT_PACKET}
                evidenceByID={{ ev_01J0ACR001: evidence }}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Open evidence" }));

        expect(screen.queryByRole("img")).not.toBeInTheDocument();
        expect(screen.queryByText(/alert\(1\)/)).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "View safe source" })).not.toBeInTheDocument();
    });

    it("records feedback only in the current browser session", async () => {
        const user = userEvent.setup();
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        render(<ContextPacketExplorer controlledState="sample" />);

        await user.click(screen.getByRole("button", { name: "Mark context as incorrect" }));

        expect(screen.getByText("Feedback recorded for this session only.")).toBeInTheDocument();
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });

    it("uses the local server boundary for live packets and preserves partial coverage", async () => {
        const user = userEvent.setup();
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ ...SAMPLE_CONTEXT_PACKET, status: "partial" }), {
                status: 200,
            }),
        );
        render(
            <ContextPacketExplorer
                controlledState="sample"
                live
                repositories={["full-chaos/dev-health-acr"]}
            />,
        );

        await user.type(screen.getByLabelText(/Goal/), "Preserve partial coverage");

        await user.click(screen.getByRole("button", { name: "Generate context" }));

        await waitFor(() => expect(screen.getByText("partial")).toBeInTheDocument());
        expect(fetchSpy).toHaveBeenCalledWith(
            "/api/agent-context/context-packets",
            expect.objectContaining({ cache: "no-store", method: "POST" }),
        );
        fetchSpy.mockRestore();
    });

    it("uses only the server-authorized live repository catalog and never starts from sample values", () => {
        render(
            <ContextPacketExplorer
                controlledState="sample"
                live
                repositories={["full-chaos/dev-health-acr", "full-chaos/dev-health-web"]}
            />,
        );

        expect(screen.getByLabelText(/Goal/)).toHaveValue("");
        expect(screen.getByRole("combobox", { name: /Repository/ })).toHaveValue(
            "full-chaos/dev-health-acr",
        );
        expect(
            screen.getByRole("option", { name: "full-chaos/dev-health-web" }),
        ).toBeInTheDocument();
        expect(screen.queryByText("Context Fabric status")).not.toBeInTheDocument();
        expect(screen.queryByText("Credential authorization review")).not.toBeInTheDocument();
    });

    it("renders a safe error state when a successful live response is malformed", async () => {
        const user = userEvent.setup();
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    ...SAMPLE_CONTEXT_PACKET,
                    freshness: { ...SAMPLE_CONTEXT_PACKET.freshness, watermarks: null },
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

        await user.type(screen.getByLabelText(/Goal/), "Reject malformed response");
        await user.click(screen.getByRole("button", { name: "Generate context" }));

        await waitFor(() => expect(screen.getByTestId("data-state-error")).toBeInTheDocument());
        expect(screen.queryByText("Credential authorization review")).not.toBeInTheDocument();
        fetchSpy.mockRestore();
    });

    it("renders the validated live partial packet without injecting sample evidence", async () => {
        const user = userEvent.setup();
        const livePacket = {
            ...SAMPLE_CONTEXT_PACKET,
            context_packet_id: "packet-live-partial",
            goal: "Inspect a live partial response",
            items: [],
            status: "partial" as const,
        };
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(JSON.stringify(livePacket), { status: 200 }));
        render(
            <ContextPacketExplorer
                controlledState="sample"
                live
                repositories={["full-chaos/dev-health-acr"]}
            />,
        );

        await user.type(screen.getByLabelText(/Goal/), "Inspect a live partial response");
        await user.click(screen.getByRole("button", { name: "Generate context" }));

        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "Inspect a live partial response" }),
            ).toBeInTheDocument(),
        );
        expect(screen.queryByText("Credential authorization review")).not.toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("partial");
        fetchSpy.mockRestore();
    });

    it("focuses and announces every terminal controlled outcome", async () => {
        for (const controlledState of ["empty", "error", "not-entitled"] as const) {
            const { unmount } = render(<ContextPacketExplorer controlledState={controlledState} />);

            await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());
            expect(screen.getByRole("status")).toHaveTextContent(
                /Context Fabric|Agent Context Runtime/,
            );
            unmount();
        }
    });

    it("loads every missing evidence reference in packet order and preserves successful results", async () => {
        const user = userEvent.setup();
        const evidenceIds = [
            "ev_01J0ACR001",
            "ev_01J0ACR002",
            "ev_01J0ACR003",
            "ev_01J0ACR004",
            "ev_01J0ACR005",
            "ev_01J0ACR006",
            "ev_01J0ACR007",
            "ev_01J0ACR008",
            "ev_01J0ACR009",
        ];
        const packet = {
            ...SAMPLE_CONTEXT_PACKET,
            items: [
                {
                    ...SAMPLE_CONTEXT_PACKET.items[0],
                    evidence_ref_ids: evidenceIds,
                },
            ],
        };
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
            const url = String(input);
            const evidenceRefId = evidenceIds.find((id) => url.includes(id)) ?? "";
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        ...SAMPLE_EXPANDED_EVIDENCE.ev_01J0ACR001,
                        evidence: {
                            ...SAMPLE_EXPANDED_EVIDENCE.ev_01J0ACR001.evidence,
                            evidence_ref_id: evidenceRefId,
                            source: {
                                ...SAMPLE_EXPANDED_EVIDENCE.ev_01J0ACR001.evidence.source,
                                display_label: `Evidence ${evidenceRefId}`,
                            },
                        },
                    }),
                    { status: 200 },
                ),
            );
        });
        render(<ContextPacketCategoryGroups packet={packet} evidenceByID={{}} />);

        await user.click(screen.getByRole("button", { name: "Open evidence" }));

        await waitFor(() => expect(screen.getByText("Evidence ev_01J0ACR009")).toBeInTheDocument());
        expect(fetchSpy).toHaveBeenCalledTimes(evidenceIds.length);
        expect(fetchSpy).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining("ev_01J0ACR001"),
            expect.anything(),
        );
        expect(fetchSpy).toHaveBeenNthCalledWith(
            evidenceIds.length,
            expect.stringContaining("ev_01J0ACR009"),
            expect.anything(),
        );
    });

    it("shares evidence requests and reuses completed evidence across reopened items", async () => {
        const user = userEvent.setup();
        const packet = {
            ...SAMPLE_CONTEXT_PACKET,
            items: [
                SAMPLE_CONTEXT_PACKET.items[0],
                { ...SAMPLE_CONTEXT_PACKET.items[0], packet_item_id: "second-item" },
            ],
        };
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify(SAMPLE_EXPANDED_EVIDENCE.ev_01J0ACR001), {
                status: 200,
            }),
        );
        render(<ContextPacketCategoryGroups packet={packet} evidenceByID={{}} />);

        const buttons = screen.getAllByRole("button", { name: "Open evidence" });
        await user.click(buttons[0]);
        await user.click(buttons[1]);

        await waitFor(() =>
            expect(screen.getAllByText("Credential authorization review")).toHaveLength(2),
        );
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        await user.click(buttons[0]);
        await user.click(buttons[0]);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("caps concurrent evidence requests across all expanded items", async () => {
        const user = userEvent.setup();
        const evidenceIds = Array.from({ length: 9 }, (_, index) => `ev-cap-${index}`);
        const resolvers = new Map<string, (response: Response) => void>();
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
            const evidenceRefId = evidenceIds.find((id) => String(input).includes(id));
            return new Promise<Response>((resolve) => {
                if (evidenceRefId) resolvers.set(evidenceRefId, resolve);
            });
        });
        const packet = {
            ...SAMPLE_CONTEXT_PACKET,
            items: [
                { ...SAMPLE_CONTEXT_PACKET.items[0], evidence_ref_ids: evidenceIds.slice(0, 5) },
                {
                    ...SAMPLE_CONTEXT_PACKET.items[0],
                    evidence_ref_ids: evidenceIds.slice(5),
                    packet_item_id: "second-evidence-item",
                },
            ],
        };
        render(<ContextPacketCategoryGroups packet={packet} evidenceByID={{}} />);

        for (const button of screen.getAllByRole("button", { name: "Open evidence" })) {
            await user.click(button);
        }
        await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(8));
        expect(resolvers.get("ev-cap-0")).toBeDefined();

        resolvers.get("ev-cap-0")?.(
            new Response(
                JSON.stringify({
                    ...SAMPLE_EXPANDED_EVIDENCE.ev_01J0ACR001,
                    evidence: {
                        ...SAMPLE_EXPANDED_EVIDENCE.ev_01J0ACR001.evidence,
                        evidence_ref_id: "ev-cap-0",
                    },
                }),
                { status: 200 },
            ),
        );
        await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(9));
    });

    it("aborts an unneeded evidence request when its packet is replaced", async () => {
        const user = userEvent.setup();
        let signal: AbortSignal | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
            signal = init?.signal ?? undefined;
            return new Promise<Response>(() => undefined);
        });
        const { rerender } = render(
            <ContextPacketCategoryGroups packet={SAMPLE_CONTEXT_PACKET} evidenceByID={{}} />,
        );

        await user.click(screen.getByRole("button", { name: "Open evidence" }));
        await waitFor(() => expect(signal).toBeDefined());
        rerender(
            <ContextPacketCategoryGroups
                packet={{ ...SAMPLE_CONTEXT_PACKET, context_packet_id: "replacement-packet" }}
                evidenceByID={{}}
            />,
        );

        expect(signal?.aborted).toBe(true);
        expect(screen.queryByText("Some evidence is unavailable")).not.toBeInTheDocument();
    });

    it("resets browser-only feedback when a new packet replaces the current packet", async () => {
        const user = userEvent.setup();
        const { rerender } = render(<ContextPacketDetails packet={SAMPLE_CONTEXT_PACKET} />);

        await user.click(screen.getByRole("button", { name: "Mark context as incorrect" }));
        expect(screen.getByText("Feedback recorded for this session only.")).toBeInTheDocument();

        rerender(
            <ContextPacketDetails
                packet={{ ...SAMPLE_CONTEXT_PACKET, context_packet_id: "packet-regenerated" }}
            />,
        );

        expect(
            screen.queryByText("Feedback recorded for this session only."),
        ).not.toBeInTheDocument();
    });

    it("reveals retrieval details only when the server authorizes an administrator", () => {
        const packet = {
            ...SAMPLE_CONTEXT_PACKET,
            retrieval_debug_summary: "Approved retrieval summary",
        };
        const { rerender } = render(<ContextPacketDetails packet={packet} />);

        expect(screen.queryByText("Approved retrieval summary")).not.toBeInTheDocument();
        rerender(<ContextPacketDetails packet={packet} showRetrievalDebug />);
        expect(screen.getByText("Approved retrieval summary")).toBeInTheDocument();
    });

    it.each([
        [
            "not-entitled",
            "Agent Context Runtime is not available for this organization",
            "data-state-not-entitled",
        ],
        ["loading", "Preparing Context Fabric response", "data-state-loading"],
        ["empty", "No context matched this scope", "data-state-empty"],
        ["error", "Context Fabric response could not be generated", "data-state-error"],
        ["degraded", "Partial context is available", "data-state-degraded"],
    ] as const)("renders the %s controlled state safely", (controlledState, title, testId) => {
        render(<ContextPacketExplorer controlledState={controlledState} />);

        expect(screen.getByTestId(testId)).toBeInTheDocument();
        expect(screen.getByText(title)).toBeInTheDocument();
    });

    it("renders partial coverage, unavailable sources, and degraded reasons", () => {
        render(<ContextPacketExplorer controlledState="degraded" />);

        expect(screen.getByText("Coverage is partial.")).toBeInTheDocument();
        expect(
            screen.getByText(
                /clickhouse_work_graph: Demo fixture does not include hosted ClickHouse/,
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Hosted evidence is unavailable in this demo fixture."),
        ).toBeInTheDocument();
    });

    it("renders available packet groups with an explicit partial coverage explanation", () => {
        render(<ContextPacketExplorer controlledState="partial" />);

        expect(screen.getByRole("heading", { name: "Pressure", level: 2 })).toBeInTheDocument();
        expect(screen.getByText("Coverage is partial.")).toBeInTheDocument();
        expect(
            screen.getByText(
                /clickhouse_work_graph: Demo fixture does not include hosted ClickHouse/,
            ),
        ).toBeInTheDocument();
    });
});

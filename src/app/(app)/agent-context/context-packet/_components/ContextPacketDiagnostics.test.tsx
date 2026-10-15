import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContextPacketDiagnostics } from "./ContextPacketDiagnostics";
import { SAMPLE_CONTEXT_PACKET } from "./samplePacket";

describe("ContextPacketDiagnostics freshness", () => {
    it("lists an unknown watermark as unknown, never as fresh, with no crash", () => {
        const packet = {
            ...SAMPLE_CONTEXT_PACKET,
            freshness: {
                ...SAMPLE_CONTEXT_PACKET.freshness,
                watermarks: [
                    {
                        source: "file_hotspots.v1",
                        last_event_at: "2026-07-01T09:00:00Z",
                        status: "unknown",
                    },
                    {
                        source: "repository_freshness.v1",
                        last_ingested_at: "2026-07-10T14:00:00Z",
                        status: "fresh",
                    },
                ],
            },
        };
        render(<ContextPacketDiagnostics packet={packet} />);
        const unknown = screen.getByText(/file_hotspots\.v1: unknown/u);
        expect(unknown.textContent).not.toMatch(/fresh/u);
        expect(screen.getByText(/repository_freshness\.v1: fresh/u)).toBeInTheDocument();
    });
});

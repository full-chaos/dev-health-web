import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

const explorerSpy = vi.fn();

vi.mock("./ContextPacketExplorer", () => ({
    ContextPacketExplorer: () => {
        explorerSpy();
        return <div data-testid="context-packet-explorer" />;
    },
}));

import { ContextPacketGatedBody } from "./ContextPacketGatedBody";

describe("ContextPacketGatedBody", () => {
    it("does not mount the packet explorer when the organization is not entitled", () => {
        explorerSpy.mockClear();

        render(<ContextPacketGatedBody enabled={false} controlledState="sample" />);

        expect(explorerSpy).not.toHaveBeenCalled();
        expect(screen.queryByTestId("context-packet-explorer")).not.toBeInTheDocument();
        expect(screen.queryByTestId("context-packet-preview-placeholder")).not.toBeInTheDocument();
    });

    it("mounts the packet explorer when the organization is entitled", () => {
        explorerSpy.mockClear();

        render(<ContextPacketGatedBody enabled controlledState="sample" />);

        expect(explorerSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("context-packet-explorer")).toBeInTheDocument();
    });
});

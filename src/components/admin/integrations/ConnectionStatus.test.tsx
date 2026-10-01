import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import { ConnectionStatus } from "./ConnectionStatus";

describe("ConnectionStatus", () => {
    it('renders "Connected" status with positive styling', () => {
        const { container } = render(<ConnectionStatus status="connected" />);

        expect(screen.getByText("Connected")).toBeInTheDocument();
        expect(container.querySelector("span[class~=\'bg-(--positive)\']")).toBeInTheDocument();
    });

    it('renders "Connection Error" status with negative styling', () => {
        const { container } = render(<ConnectionStatus status="error" />);

        expect(screen.getByText("Connection Error")).toBeInTheDocument();
        expect(container.querySelector("span[class~=\'bg-(--negative)\']")).toBeInTheDocument();
    });

    it('renders "Not Configured" status with muted styling', () => {
        const { container } = render(<ConnectionStatus status="not_configured" />);

        expect(screen.getByText("Not Configured")).toBeInTheDocument();
        expect(container.querySelector("span[class~=\'bg-(--ink-muted)\']")).toBeInTheDocument();
    });

    it('renders "Connecting..." with info pulsing dot', () => {
        const { container } = render(<ConnectionStatus status="connecting" />);

        expect(screen.getByText("Connecting...")).toBeInTheDocument();
        expect(
            container.querySelector("span[class~=\'bg-(--info)\'].animate-pulse"),
        ).toBeInTheDocument();
    });

    it('renders "Connection failing" status with negative styling', () => {
        const { container } = render(<ConnectionStatus status="failing" />);

        expect(screen.getByText("Connection failing")).toBeInTheDocument();
        expect(container.querySelector("span[class~=\'bg-(--negative)\']")).toBeInTheDocument();
    });

    it('renders "Needs verification" status with caution styling, never "Connected"', () => {
        const { container } = render(<ConnectionStatus status="untested" />);

        expect(screen.getByText("Needs verification")).toBeInTheDocument();
        expect(container.querySelector("span[class~=\'bg-(--caution)\']")).toBeInTheDocument();
        expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    });

    it('renders "Inactive" status with muted styling', () => {
        const { container } = render(<ConnectionStatus status="inactive" />);

        expect(screen.getByText("Inactive")).toBeInTheDocument();
        expect(container.querySelector("span[class~=\'bg-(--ink-muted)\']")).toBeInTheDocument();
    });

    it("applies custom className", () => {
        render(<ConnectionStatus status="connected" className="my-custom-class" />);

        expect(screen.getByText("Connected").closest("span")).toHaveClass("my-custom-class");
    });
});

import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import { ConnectionStatus } from "./ConnectionStatus";

describe("ConnectionStatus", () => {
    it('renders "Connected" status with green styling', () => {
        const { container } = render(<ConnectionStatus status="connected" />);

        expect(screen.getByText("Connected")).toBeInTheDocument();
        expect(container.querySelector("span.bg-green-500")).toBeInTheDocument();
    });

    it('renders "Connection Error" status with red styling', () => {
        const { container } = render(<ConnectionStatus status="error" />);

        expect(screen.getByText("Connection Error")).toBeInTheDocument();
        expect(container.querySelector("span.bg-red-500")).toBeInTheDocument();
    });

    it('renders "Not Configured" status with gray styling', () => {
        const { container } = render(<ConnectionStatus status="not_configured" />);

        expect(screen.getByText("Not Configured")).toBeInTheDocument();
        expect(container.querySelector("span.bg-gray-400")).toBeInTheDocument();
    });

    it('renders "Connecting..." with blue pulsing dot', () => {
        const { container } = render(<ConnectionStatus status="connecting" />);

        expect(screen.getByText("Connecting...")).toBeInTheDocument();
        expect(container.querySelector("span.bg-blue-500.animate-pulse")).toBeInTheDocument();
    });

    it('renders "Connection failing" status with red styling', () => {
        const { container } = render(<ConnectionStatus status="failing" />);

        expect(screen.getByText("Connection failing")).toBeInTheDocument();
        expect(container.querySelector("span.bg-red-500")).toBeInTheDocument();
    });

    it('renders "Needs verification" status with amber styling, never "Connected"', () => {
        const { container } = render(<ConnectionStatus status="untested" />);

        expect(screen.getByText("Needs verification")).toBeInTheDocument();
        expect(container.querySelector("span.bg-amber-500")).toBeInTheDocument();
        expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    });

    it('renders "Inactive" status with gray styling', () => {
        const { container } = render(<ConnectionStatus status="inactive" />);

        expect(screen.getByText("Inactive")).toBeInTheDocument();
        expect(container.querySelector("span.bg-gray-400")).toBeInTheDocument();
    });

    it("applies custom className", () => {
        render(<ConnectionStatus status="connected" className="my-custom-class" />);

        expect(screen.getByText("Connected").closest("span")).toHaveClass("my-custom-class");
    });
});

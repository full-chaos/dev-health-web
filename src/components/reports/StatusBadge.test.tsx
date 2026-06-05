import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "./StatusBadge";
import { ReportStatus } from "@/lib/reports/types";

describe("StatusBadge", () => {
    it("renders 'Never run' when no status is provided", () => {
        render(<StatusBadge />);
        expect(screen.getByText("Never run")).toBeInTheDocument();
    });

    it("renders 'Success' for SUCCESS status", () => {
        render(<StatusBadge status={ReportStatus.SUCCESS} />);
        expect(screen.getByText("Success")).toBeInTheDocument();
    });

    it("renders 'Failed' for FAILED status", () => {
        render(<StatusBadge status={ReportStatus.FAILED} />);
        expect(screen.getByText("Failed")).toBeInTheDocument();
    });

    it("renders 'Running' for RUNNING status", () => {
        render(<StatusBadge status={ReportStatus.RUNNING} />);
        expect(screen.getByText("Running")).toBeInTheDocument();
    });
});

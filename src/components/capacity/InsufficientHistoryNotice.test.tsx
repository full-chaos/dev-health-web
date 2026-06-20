import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import type { ThroughputRollingWindow } from "@/lib/graphql/types";
import { InsufficientHistoryNotice } from "./InsufficientHistoryNotice";

function windows(overrides: Partial<ThroughputRollingWindow>[] = []): ThroughputRollingWindow[] {
    const base: ThroughputRollingWindow[] = [
        {
            windowWeeks: 4,
            meanWeeklyThroughput: 0,
            sampleCount: 0,
            insufficientHistory: true,
        },
        {
            windowWeeks: 8,
            meanWeeklyThroughput: 0,
            sampleCount: 0,
            insufficientHistory: true,
        },
        {
            windowWeeks: 12,
            meanWeeklyThroughput: 0,
            sampleCount: 0,
            insufficientHistory: true,
        },
    ];
    return base.map((window, index) => ({ ...window, ...overrides[index] }));
}

describe("InsufficientHistoryNotice", () => {
    it("renders nothing when history is sufficient", () => {
        const { container } = render(
            <InsufficientHistoryNotice insufficientHistory={false} rollingWindows={windows()} />,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it("surfaces a status warning when history is insufficient", () => {
        render(<InsufficientHistoryNotice insufficientHistory rollingWindows={windows()} />);
        const notice = screen.getByRole("status");
        expect(notice).toBeInTheDocument();
        expect(screen.getByText("Limited history")).toBeInTheDocument();
        expect(screen.getByText("Forecast provisional")).toBeInTheDocument();
    });

    it("breaks down per-window sample counts with an insufficient marker", () => {
        render(
            <InsufficientHistoryNotice
                insufficientHistory
                rollingWindows={windows([
                    { windowWeeks: 4, sampleCount: 3, insufficientHistory: false },
                ])}
            />,
        );
        expect(screen.getByText("4w")).toBeInTheDocument();
        expect(screen.getByText("3 samples")).toBeInTheDocument();
        // Short windows still flag insufficiency.
        expect(screen.getAllByText(/insufficient/).length).toBeGreaterThanOrEqual(2);
    });

    it("uses the singular noun for a single sample", () => {
        render(
            <InsufficientHistoryNotice
                insufficientHistory
                rollingWindows={windows([
                    { windowWeeks: 4, sampleCount: 1, insufficientHistory: false },
                ])}
            />,
        );
        expect(screen.getByText("1 sample")).toBeInTheDocument();
    });
});

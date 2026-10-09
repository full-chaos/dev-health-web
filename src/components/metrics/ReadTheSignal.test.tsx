import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import { ReadTheSignal, signalDirection } from "./ReadTheSignal";

describe("signalDirection", () => {
    it("follows the sign of the persisted delta; 'unchanged' only when the displayed delta is 0%", () => {
        expect(signalDirection(12)).toBe("up");
        expect(signalDirection(-3)).toBe("down");
        expect(signalDirection(0)).toBe("unchanged");
        expect(signalDirection(-0)).toBe("unchanged");
        // The Snapshot card's formatter shows a small served change ("+0.4%", "-0.4%"), not 0%,
        // so the direction follows its sign.
        expect(signalDirection(0.4)).toBe("up");
        expect(signalDirection(-0.4)).toBe("down");
        expect(signalDirection(0.6)).toBe("up");
    });

    it("a missing delta is unavailable, never 0", () => {
        expect(signalDirection(null)).toBe("unavailable");
        expect(signalDirection(undefined)).toBe("unavailable");
        expect(signalDirection(Number.NaN)).toBe("unavailable");
    });
});

describe("ReadTheSignal", () => {
    it("states direction with 'appears', the two persisted numbers and the not-a-diagnosis line", () => {
        render(<ReadTheSignal label="Review Latency" value={6} unit="hours" deltaPct={30} />);
        expect(screen.getByTestId("signal-headline")).toHaveTextContent(
            "Review Latency appears up",
        );
        expect(screen.getByTestId("signal-numbers")).toHaveTextContent(
            "The evidence page shows 6h and a +30% change over the selected window.",
        );
        expect(screen.getByText(/Inspect before interpreting/)).toBeInTheDocument();
        expect(
            screen.getByText(/rather than treating a percentage change as a causal diagnosis/),
        ).toBeInTheDocument();
    });

    it("a delta missing for lack of prior data says the change is unavailable (no 0% claim)", () => {
        render(
            <ReadTheSignal
                label="Throughput"
                value={50}
                unit="items"
                deltaPct={null}
                hasPriorData={false}
            />,
        );
        expect(screen.getByTestId("signal-headline")).toHaveTextContent(
            "Throughput: change unavailable",
        );
        expect(screen.getByTestId("signal-numbers")).toHaveTextContent(
            "change against the previous window is unavailable",
        );
        expect(screen.getByTestId("signal-numbers")).not.toHaveTextContent("0%");
    });

    it("a missing value says so", () => {
        render(<ReadTheSignal label="Throughput" value={undefined} unit="items" deltaPct={5} />);
        expect(screen.getByTestId("signal-numbers")).toHaveTextContent(
            "The value for this window is unavailable.",
        );
    });

    it("judges nothing: no status color classes, no good / bad words", () => {
        const { container } = render(
            <ReadTheSignal label="Cycle Time" value={4} unit="days" deltaPct={-20} />,
        );
        expect(container.innerHTML).not.toMatch(
            /positive|negative|caution|emerald|amber|red-|green-/u,
        );
        expect(container).not.toHaveTextContent(/\b(good|bad|worse|better|improved|worsened)\b/i);
    });
});

import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import {
    CoverageBadge,
    healthLabel,
    healthTone,
    jobCoverageLabel,
    jobCoverageTone,
    statusLabel,
    statusTone,
} from "./CoverageBadge";

describe("CoverageBadge", () => {
    it("renders the label text alongside a decorative glyph", () => {
        render(<CoverageBadge tone="positive" label="Healthy" />);

        expect(screen.getByText("Healthy")).toBeInTheDocument();
    });

    it("maps every coverage health to a distinct tone with deterministic precedence", () => {
        expect(healthTone("failed")).toBe("negative");
        expect(healthTone("gaps")).toBe("caution");
        expect(healthTone("stale")).toBe("caution");
        expect(healthTone("healthy")).toBe("positive");
        expect(healthTone("insufficient_data")).toBe("info");
    });

    it("never renders the literal word 'unknown' for any health label", () => {
        const healths: Array<Parameters<typeof healthLabel>[0]> = [
            "healthy",
            "stale",
            "gaps",
            "failed",
            "insufficient_data",
        ];
        for (const health of healths) {
            expect(healthLabel(health).toLowerCase()).not.toContain("unknown");
        }
    });

    it("maps dataset/source status tones including scheduling states", () => {
        expect(statusTone("paused")).toBe("muted");
        expect(statusTone("not_scheduled")).toBe("muted");
        expect(statusTone("running")).toBe("info");
        expect(statusLabel("not_scheduled")).toBe("Not scheduled");
    });

    it("maps job coverage results derived from persisted unit counts", () => {
        expect(jobCoverageTone("complete")).toBe("positive");
        expect(jobCoverageTone("partial")).toBe("caution");
        expect(jobCoverageTone("gap")).toBe("caution");
        expect(jobCoverageTone("failed")).toBe("negative");
        expect(jobCoverageLabel("gap")).toBe("Gap");
    });
});

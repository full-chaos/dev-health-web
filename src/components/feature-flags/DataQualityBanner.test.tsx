import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import { DATA_COMPLETENESS_THRESHOLD, GATE_COPY } from "@/lib/feature-flags/interpretation";
import { DataQualityBanner } from "./DataQualityBanner";

describe("DataQualityBanner", () => {
    it("renders nothing when no condition holds", () => {
        const { container } = render(
            <DataQualityBanner
                dataCompleteness={DATA_COMPLETENESS_THRESHOLD}
                cohortContamination={0}
                concurrentDeployCount={0}
            />,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it("shows data-arriving copy with percent only below the threshold", () => {
        render(<DataQualityBanner dataCompleteness={0.5} />);
        expect(screen.getByText(GATE_COPY.dataArriving)).toBeInTheDocument();
        expect(screen.getByText("50% complete")).toBeInTheDocument();
    });

    it("shows contamination copy only when contamination is above zero", () => {
        render(<DataQualityBanner cohortContamination={0.2} />);
        expect(screen.getByText(GATE_COPY.contamination(0.2))).toBeInTheDocument();
    });

    it("shows concurrent-deploy copy only when the count is above zero", () => {
        render(<DataQualityBanner concurrentDeployCount={2} />);
        expect(screen.getByText(GATE_COPY.concurrentDeploys(2))).toBeInTheDocument();
    });
});

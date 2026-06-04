/**
 * Phase 2 (CHAOS-2075) — AreaHub title reconciliation.
 *
 * The four area landings (dashboard, work, opportunities, testops) now pass
 * title="Related workflows" instead of "<Area> signals" / "<Area> area" so
 * the section is not framed as the primary nav directory (the sidebar owns
 * findability). The signal cards themselves are triage content and stay.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@/test/utils";

import { AreaHub } from "./AreaHub";
import type { AreaSignal } from "@/lib/areaSignals/types";
import { defaultMetricFilter } from "@/lib/filters/defaults";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const stubSignal: AreaSignal = {
  id: "coverage",
  label: "Coverage",
  href: "/testops/coverage",
  cluster: "Quality",
  metricLabel: "Line coverage",
  value: "82%",
  state: "medium",
};

describe("AreaHub — title prop (Phase 2: Related workflows framing)", () => {
  it("renders the explicit title prop instead of the default '<Area> area'", () => {
    render(
      <AreaHub
        areaId="govern"
        signals={[stubSignal]}
        filters={defaultMetricFilter}
        title="Related workflows"
      />,
    );
    expect(screen.getByText("Related workflows")).toBeInTheDocument();
    // Default title "Govern area" must NOT appear.
    expect(screen.queryByText("Govern area")).toBeNull();
  });

  it("falls back to '<Area> area' when no title is provided", () => {
    render(
      <AreaHub
        areaId="govern"
        signals={[stubSignal]}
        filters={defaultMetricFilter}
      />,
    );
    expect(screen.getByText("Govern area")).toBeInTheDocument();
  });

  it("still renders signal cards when title is 'Related workflows'", () => {
    render(
      <AreaHub
        areaId="govern"
        signals={[stubSignal]}
        filters={defaultMetricFilter}
        title="Related workflows"
      />,
    );
    expect(screen.getByTestId("area-hub")).toBeInTheDocument();
    expect(screen.getAllByTestId("area-signal-card")).toHaveLength(1);
  });
});

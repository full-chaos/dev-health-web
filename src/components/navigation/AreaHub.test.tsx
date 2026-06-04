/** AreaHub component tests (CHAOS-2074). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";

import { AreaHub } from "./AreaHub";
import type { AreaSignal, AreaSignalState } from "@/lib/areaSignals/types";
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

function signal(
  id: string,
  state: AreaSignalState,
  cluster?: string,
  extra: Partial<AreaSignal> = {},
): AreaSignal {
  return {
    id,
    label: id,
    href: `/${id}`,
    cluster,
    metricLabel: `${id} metric`,
    value: state === "unavailable" ? "" : "42%",
    state,
    ...extra,
  };
}

afterEach(cleanup);

function renderHub(signals: AreaSignal[]) {
  return render(<AreaHub areaId="govern" signals={signals} filters={defaultMetricFilter} />);
}

describe("AreaHub — severity-sorted signal cards", () => {
  it("renders nothing when there are no signals", () => {
    const { container } = renderHub([]);
    expect(container.firstChild).toBeNull();
  });

  it("orders cards by severity within a cluster (critical → low → unavailable last)", () => {
    renderHub([
      signal("a", "low", "Quality"),
      signal("u", "unavailable", "Quality"),
      signal("c", "critical", "Quality"),
      signal("m", "medium", "Quality"),
    ]);
    const cards = screen.getAllByTestId("area-signal-card");
    expect(cards.map((c) => c.getAttribute("data-signal-id"))).toEqual(["c", "m", "a", "u"]);
  });

  it("groups by cluster with headers, each cluster severity-sorted (Govern: Quality then Risk)", () => {
    renderHub([
      signal("flake", "medium", "Quality"),
      signal("sec", "critical", "Risk"),
      signal("cov", "low", "Quality"),
      signal("flags", "high", "Risk"),
    ]);

    // Cluster headers present and ordered.
    expect(screen.getByText("Quality")).toBeInTheDocument();
    expect(screen.getByText("Risk")).toBeInTheDocument();

    const clusters = screen.getAllByTestId("area-hub-cluster");
    expect(clusters.map((c) => c.getAttribute("data-cluster"))).toEqual(["Quality", "Risk"]);

    // Within Quality: medium before low.
    const quality = clusters[0];
    expect(
      within(quality)
        .getAllByTestId("area-signal-card")
        .map((c) => c.getAttribute("data-signal-id")),
    ).toEqual(["flake", "cov"]);
    // Within Risk: critical before high.
    const risk = clusters[1];
    expect(
      within(risk)
        .getAllByTestId("area-signal-card")
        .map((c) => c.getAttribute("data-signal-id")),
    ).toEqual(["sec", "flags"]);
  });

  it("renders a flat single bucket (no headers) when nothing is clustered", () => {
    renderHub([signal("a", "low"), signal("b", "critical")]);
    const clusters = screen.getAllByTestId("area-hub-cluster");
    expect(clusters).toHaveLength(1);
    expect(clusters[0].getAttribute("data-cluster")).toBe("");
  });

  it("renders an unavailable signal as an inline DataState (no fabricated value), sunk last", () => {
    renderHub([signal("ok", "high", "Quality"), signal("gap", "unavailable", "Quality")]);

    const gap = screen
      .getAllByTestId("area-signal-card")
      .find((c) => c.getAttribute("data-signal-id") === "gap")!;
    expect(gap.getAttribute("data-state")).toBe("unavailable");
    expect(within(gap).getByTestId("area-signal-unavailable")).toBeInTheDocument();
    // No metric value node rendered for the unavailable card.
    expect(within(gap).queryByTestId("area-signal-value")).toBeNull();

    // It is the last card overall.
    const order = screen
      .getAllByTestId("area-signal-card")
      .map((c) => c.getAttribute("data-signal-id"));
    expect(order[order.length - 1]).toBe("gap");
  });

  it("emphasizes the single most-severe severity-bearing signal exactly once", () => {
    renderHub([
      signal("low", "low", "Quality"),
      signal("crit", "critical", "Risk"),
      signal("high", "high", "Quality"),
    ]);
    const emphasized = screen
      .getAllByTestId("area-signal-card")
      .filter((c) => c.getAttribute("data-emphasized") === "true");
    expect(emphasized).toHaveLength(1);
    expect(emphasized[0].getAttribute("data-signal-id")).toBe("crit");
  });

  it("marks a demoted signal secondary via the data attribute", () => {
    renderHub([
      signal("sec", "high", "Risk"),
      signal("flags", "medium", "Risk", { demoted: true }),
    ]);
    const flags = screen
      .getAllByTestId("area-signal-card")
      .find((c) => c.getAttribute("data-signal-id") === "flags")!;
    expect(flags.getAttribute("data-demoted")).toBe("true");
  });
});

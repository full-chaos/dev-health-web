import { describe, expect, it } from "vitest";

import { groupByCluster, isAvailable, sortBySeverity, topSignals } from "../sort";
import type { AreaSignal, AreaSignalState } from "../types";

function signal(id: string, state: AreaSignalState, cluster?: string): AreaSignal {
  return {
    id,
    label: id,
    href: `/${id}`,
    cluster,
    metricLabel: `${id} metric`,
    value: state === "unavailable" ? "" : "1",
    state,
  };
}

describe("sortBySeverity", () => {
  it("orders critical > high > medium > low > neutral > unavailable", () => {
    const input = [
      signal("a", "low"),
      signal("b", "unavailable"),
      signal("c", "critical"),
      signal("d", "neutral"),
      signal("e", "high"),
      signal("f", "medium"),
    ];
    expect(sortBySeverity(input).map((s) => s.id)).toEqual(["c", "e", "f", "a", "d", "b"]);
  });

  it("sinks every unavailable signal to the bottom regardless of input order", () => {
    const input = [
      signal("u1", "unavailable"),
      signal("hi", "high"),
      signal("u2", "unavailable"),
      signal("crit", "critical"),
    ];
    const ordered = sortBySeverity(input);
    expect(ordered.map((s) => s.id)).toEqual(["crit", "hi", "u1", "u2"]);
    // both unavailable cards are last
    expect(ordered.slice(-2).every((s) => !isAvailable(s))).toBe(true);
  });

  it("is stable within a severity band (preserves input order on ties)", () => {
    const input = [signal("first", "high"), signal("second", "high"), signal("third", "high")];
    expect(sortBySeverity(input).map((s) => s.id)).toEqual(["first", "second", "third"]);
  });

  it("does not mutate the input array", () => {
    const input = [signal("a", "low"), signal("b", "critical")];
    const copy = [...input];
    sortBySeverity(input);
    expect(input).toEqual(copy);
  });
});

describe("groupByCluster", () => {
  it("groups by cluster, preserving first-seen cluster order, each severity-sorted", () => {
    const input = [
      signal("cov", "low", "Quality"),
      signal("sec", "critical", "Risk"),
      signal("flake", "high", "Quality"),
      signal("flags", "medium", "Risk"),
    ];
    const groups = groupByCluster(input);
    expect(groups.map((g) => g.cluster)).toEqual(["Quality", "Risk"]);
    expect(groups[0].signals.map((s) => s.id)).toEqual(["flake", "cov"]); // high before low
    expect(groups[1].signals.map((s) => s.id)).toEqual(["sec", "flags"]); // crit before med
  });

  it("returns a single undefined-cluster bucket when nothing is clustered (flat areas)", () => {
    const input = [signal("a", "low"), signal("b", "critical")];
    const groups = groupByCluster(input);
    expect(groups).toHaveLength(1);
    expect(groups[0].cluster).toBeUndefined();
    expect(groups[0].signals.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("sinks unavailable signals to the bottom within their cluster", () => {
    const input = [signal("u", "unavailable", "Quality"), signal("ok", "medium", "Quality")];
    expect(groupByCluster(input)[0].signals.map((s) => s.id)).toEqual(["ok", "u"]);
  });
});

describe("topSignals", () => {
  it("returns the top N available signals by severity, excluding unavailable", () => {
    const input = [
      signal("u", "unavailable"),
      signal("low", "low"),
      signal("crit", "critical"),
      signal("high", "high"),
      signal("med", "medium"),
    ];
    expect(topSignals(input, 3).map((s) => s.id)).toEqual(["crit", "high", "med"]);
  });

  it("never bubbles an unavailable metric even when it is the only signal", () => {
    expect(topSignals([signal("u", "unavailable")], 3)).toEqual([]);
  });
});

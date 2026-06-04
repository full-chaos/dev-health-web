import { render, screen } from "@/test/utils";
import { describe, expect, it } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import type { HomeResponse } from "@/lib/types";

import { CockpitClient } from "./CockpitClient";

const filters = {
  scope: { level: "org", ids: ["org-1"] },
  time: { range_days: 14 },
  who: {},
  what: {},
  why: {},
  how: {},
} as MetricFilter;

const home: HomeResponse = {
  freshness: {
    last_ingested_at: null,
    sources: {},
    coverage: {
      repos_covered_pct: 0,
      prs_linked_to_issues_pct: 0,
      issues_with_cycle_states_pct: 0,
    },
  },
  deltas: [],
  summary: [
    {
      id: "shift-1",
      text: "Review latency eased while delivery risk stayed elevated.",
      evidence_link: "/api/evidence/review-latency",
    },
  ],
  tiles: {
    quality: {
      title: "Quality dashboard",
      subtitle: "Full workflow should not render inline",
      link: "/api/evidence/quality",
    },
  },
  constraint: {
    title: "Review load",
    claim: "Reviewer capacity is the limiting factor.",
    evidence: [{ label: "Review queue evidence", link: "/api/evidence/review" }],
    experiments: ["Rotate reviewers"],
  },
  events: [
    {
      ts: "2026-06-04T00:00:00Z",
      type: "Deployment",
      text: "Deployments slowed",
      link: "/api/evidence/deployment",
    },
  ],
  limiting_factor: {
    claim: "Reviewer capacity is the limiting factor.",
    why_it_matters: "Review queues are constraining throughput.",
    recommended_action: "Rebalance review ownership.",
    confidence: "medium",
    evidence_ref: "/api/evidence/limiting-factor",
  },
};

describe("CockpitClient", () => {
  it("keeps only notable shifts and limiting factor on the executive surface", () => {
    render(<CockpitClient home={home} filters={filters} />);

    expect(screen.getByText("Notable shifts")).toBeInTheDocument();
    expect(screen.getByText("Limiting factor")).toBeInTheDocument();
    expect(screen.getByText(/Review latency eased/i)).toBeInTheDocument();
    expect(screen.getByText(/Reviewer capacity/i)).toBeInTheDocument();
    expect(screen.queryByText("Investigation threads")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent events")).not.toBeInTheDocument();
    expect(screen.queryByText("Quality dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Deployments slowed")).not.toBeInTheDocument();
  });
});

export type Coverage = {
  repos_covered_pct: number;
  prs_linked_to_issues_pct: number;
  issues_with_cycle_states_pct: number;
};

export type Freshness = {
  last_ingested_at: string | null;
  sources: Record<string, "ok" | "degraded" | "down">;
  coverage: Coverage;
};

export type SparkPoint = {
  ts: string;
  value: number;
};

export type MetricDelta = {
  metric: string;
  label: string;
  value: number;
  unit: string;
  delta_pct: number;
  spark: SparkPoint[];
};

export type SummarySentence = {
  id: string;
  text: string;
  evidence_link: string;
};

export type Constraint = {
  title: string;
  claim: string;
  evidence: Array<{ label: string; link: string }>;
  experiments: string[];
};

export type EventItem = {
  ts: string;
  type: string;
  text: string;
  link: string;
};

export type HomeResponse = {
  freshness: Freshness;
  deltas: MetricDelta[];
  summary: SummarySentence[];
  tiles: Record<string, { title: string; subtitle?: string; link: string }>;
  constraint: Constraint;
  events: EventItem[];
};

export type Contributor = {
  id: string;
  label: string;
  value: number;
  delta_pct: number;
  evidence_link: string;
};

export type ExplainResponse = {
  metric: string;
  label: string;
  unit: string;
  value: number;
  delta_pct: number;
  drivers: Contributor[];
  contributors: Contributor[];
  drilldown_links: Record<string, string>;
};

export type OpportunityCard = {
  id: string;
  title: string;
  rationale: string;
  evidence_links: string[];
  suggested_experiments: string[];
};

export type OpportunitiesResponse = {
  items: OpportunityCard[];
};

export type HealthResponse = {
  status: string;
  services: Record<string, string>;
};

export type InvestmentResponse = {
  categories: Array<{ key: string; name: string; value: number }>;
  subtypes: Array<{ name: string; value: number; parentKey: string }>;
  edges?: Array<Record<string, unknown>>;
};

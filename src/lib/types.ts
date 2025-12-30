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

export type DrilldownResponse = {
  items: Array<Record<string, unknown>>;
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

export type SankeyMode = "investment" | "expense" | "state" | "hotspot";

export type SankeyNode = {
  name: string;
  group?: string;
  value?: number;
};

export type SankeyLink = {
  source: string;
  target: string;
  value: number;
};

export type SankeyResponse = {
  mode: SankeyMode;
  nodes: SankeyNode[];
  links: SankeyLink[];
  unit?: string;
  label?: string;
  description?: string;
};

export type PersonIdentity = {
  provider: string;
  handle: string;
};

export type PersonSummaryPerson = {
  person_id: string;
  display_name: string;
  identities: PersonIdentity[];
  active?: boolean;
  team_id?: string;
};

export type PeopleSearchResult = PersonSummaryPerson;

export type PersonNarrative = {
  id: string;
  text: string;
  evidence_link: string;
};

export type PersonWorkMix = {
  categories: Array<{ key: string; name: string; value: number }>;
  subtypes?: Array<{ name: string; value: number; parentKey: string }>;
};

export type PersonFlowStage = {
  stage: string;
  value: number;
  unit?: string;
};

export type PersonFlowBreakdown = {
  stages?: PersonFlowStage[];
  by_stage?: PersonFlowStage[];
};

export type PersonCollaborationStat = {
  label: string;
  value: number;
  detail?: string;
};

export type PersonCollaborationSection = {
  review_load?: Record<string, number> | PersonCollaborationStat[];
  handoff_points?: Record<string, number> | PersonCollaborationStat[];
};

export type PersonSummary = {
  person: PersonSummaryPerson;
  freshness: Freshness;
  identity_coverage_pct?: number;
  deltas: MetricDelta[];
  narrative: PersonNarrative[];
  sections: {
    work_mix?: PersonWorkMix;
    flow_breakdown?: PersonFlowBreakdown;
    collaboration?: PersonCollaborationSection;
  };
};

export type PersonMetricDefinition = Record<
  string,
  string | number | string[]
>;

export type PersonMetricTimeseriesPoint = {
  day: string;
  value: number;
};

export type PersonMetricBreakdown = {
  by_repo?: Array<{ repo: string; value: number }>;
  by_work_type?: Array<{ work_type: string; value: number }>;
  by_stage?: Array<{ stage: string; value: number }>;
};

export type PersonMetricDriver = {
  text: string;
  link: string;
};

export type PersonMetricResponse = {
  metric: string;
  label: string;
  definition?: PersonMetricDefinition;
  timeseries: PersonMetricTimeseriesPoint[];
  breakdowns: PersonMetricBreakdown;
  drivers: PersonMetricDriver[];
};

export type PersonDrilldownResponse = {
  items: Array<Record<string, unknown>>;
  next_cursor?: string | null;
};

export type HeatmapAxis = {
  x: string[];
  y: string[];
};

export type HeatmapCell = {
  x: string;
  y: string;
  value: number;
};

export type HeatmapLegend = {
  unit: string;
  scale: "linear" | "log";
};

export type HeatmapResponse = {
  axes: HeatmapAxis;
  cells: HeatmapCell[];
  legend: HeatmapLegend;
  evidence?: Array<Record<string, unknown>>;
};

export type FlameFrame = {
  id: string;
  parent_id: string | null;
  label: string;
  start: string;
  end: string;
  state: "active" | "waiting" | "blocked" | "ci";
  category: "planned" | "unplanned" | "rework";
};

export type FlameResponse = {
  entity: Record<string, unknown>;
  timeline: { start: string; end: string };
  frames: FlameFrame[];
};

export type QuadrantAxis = {
  metric: string;
  label: string;
  unit: string;
};

export type QuadrantPointTrajectory = {
  x: number;
  y: number;
  window: string;
};

export type QuadrantPoint = {
  entity_id: string;
  entity_label: string;
  x: number;
  y: number;
  window_start: string;
  window_end: string;
  evidence_link: string;
  trajectory?: QuadrantPointTrajectory[];
};

export type QuadrantAnnotation = {
  type: string;
  description: string;
  x_range: [number, number];
  y_range: [number, number];
};

export type QuadrantResponse = {
  axes: { x: QuadrantAxis; y: QuadrantAxis };
  points: QuadrantPoint[];
  annotations: QuadrantAnnotation[];
};

// Aggregated flame graph types (hierarchical tree format)

export type AggregatedFlameNode = {
  name: string;
  value: number;
  children?: AggregatedFlameNode[];
};

export type AggregatedFlameMeta = {
  window_start: string;
  window_end: string;
  filters: Record<string, unknown>;
  notes: string[];
};

export type AggregatedFlameMode = "cycle_breakdown" | "code_hotspots";

export type AggregatedFlameResponse = {
  mode: AggregatedFlameMode;
  unit: string;
  root: AggregatedFlameNode;
  meta: AggregatedFlameMeta;
};


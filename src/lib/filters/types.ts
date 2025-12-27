export type TimeFilter = {
  range_days: number;
  compare_days: number;
};

export type ScopeFilter = {
  level: "org" | "team" | "repo" | "service" | "developer";
  ids: string[];
};

export type WhoFilter = {
  developers?: string[];
  roles?: string[];
};

export type WhatFilter = {
  repos?: string[];
  services?: string[];
  artifacts?: Array<"pr" | "issue" | "commit" | "pipeline">;
};

export type WhyFilter = {
  work_category?: string[];
  issue_type?: string[];
  initiative?: string[];
};

export type HowFilter = {
  flow_stage?: string[];
  blocked?: boolean;
  wip_state?: string[];
};

export type MetricFilter = {
  time: TimeFilter;
  scope: ScopeFilter;
  who: WhoFilter;
  what: WhatFilter;
  why: WhyFilter;
  how: HowFilter;
};

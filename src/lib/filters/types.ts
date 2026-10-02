export type TimeFilter = {
    range_days: number;
    compare_days: number;
    start_date?: string;
    end_date?: string;
};

export type ScopeFilter = {
    level: "org" | "team" | "repo" | "service" | "developer";
    ids: string[];
};

export type WhoFilter = {
    developers?: string[];
};

export type WhatFilter = {
    repos?: string[];
    services?: string[];
};

export type WhyFilter = {
    work_category?: string[];
    initiative?: string[];
};

export type HowFilter = {
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

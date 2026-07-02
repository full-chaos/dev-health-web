import type { MetricFilter } from "@/lib/filters/types";

export const DATE_PRESETS = [
    { label: "7d", days: 7 },
    { label: "14d", days: 14 },
    { label: "30d", days: 30 },
    { label: "90d", days: 90 },
];

export type FilterOptions = {
    teams: string[];
    repos: string[];
    services: string[];
    developers: string[];
    work_category: string[];
    issue_type: string[];
    flow_stage: string[];
};

export const EMPTY_FILTER_OPTIONS: FilterOptions = {
    teams: [],
    repos: [],
    services: [],
    developers: [],
    work_category: [],
    issue_type: [],
    flow_stage: [],
};

export const toList = (value: string) =>
    value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

const EMAIL_VALUE_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export const toEmailList = (value: string) =>
    toList(value).filter((item) => EMAIL_VALUE_PATTERN.test(item));

export const toValue = (value?: string[]) => (value && value.length ? value.join(", ") : "");

export const formatSelection = (values: string[], emptyLabel: string) => {
    if (!values.length) {
        return emptyLabel;
    }
    if (values.length <= 2) {
        return values.join(", ");
    }
    return `${values.length} selected`;
};

export const toggleValue = (values: string[], value: string) => {
    if (values.includes(value)) {
        return values.filter((item) => item !== value);
    }
    return [...values, value];
};

export const scopeLabelMap: Record<MetricFilter["scope"]["level"], string> = {
    org: "Org",
    team: "Team",
    repo: "Repo",
    service: "Service",
    developer: "Developer",
};

type WorkSubtype = {
  name: string;
  value: number;
};

export type WorkCategory = {
  name: string;
  value: number;
  subtypes: WorkSubtype[];
};

export const workCategories: WorkCategory[] = [
  {
    name: "Feature Work",
    value: 42,
    subtypes: [
      { name: "Feature Area: Core", value: 18 },
      { name: "Feature Area: Growth", value: 14 },
      { name: "Feature Area: UX Polish", value: 10 },
    ],
  },
  {
    name: "Platform",
    value: 24,
    subtypes: [
      { name: "Infra Modernization", value: 10 },
      { name: "Developer Tooling", value: 8 },
      { name: "Security Hardening", value: 6 },
    ],
  },
  {
    name: "Reliability",
    value: 18,
    subtypes: [
      { name: "Incident Fixes", value: 8 },
      { name: "SLO Improvements", value: 6 },
      { name: "Performance Tuning", value: 4 },
    ],
  },
  {
    name: "Research",
    value: 10,
    subtypes: [
      { name: "Discovery Spikes", value: 6 },
      { name: "Prototype Studies", value: 4 },
    ],
  },
  {
    name: "Operations",
    value: 6,
    subtypes: [
      { name: "Support Rotation", value: 4 },
      { name: "Release Ops", value: 2 },
    ],
  },
];

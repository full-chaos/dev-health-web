/**
 * The three tiles of the Bottlenecks page (prototype `metrics([M.wip, M.blocked, M.review], 3)`),
 * with the production captions. A plain module: the server page and the client tile strip both
 * read it (a value exported from a "use client" module is a client reference on the server).
 */
export const BOTTLENECK_TILES = [
    { metric: "wip_saturation", caption: "Work in progress" },
    { metric: "blocked_work", caption: "Blocked items" },
    { metric: "review_latency", caption: "Time to first review" },
] as const;

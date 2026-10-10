import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { render, screen, within } from "@/test/utils";
import { NeutralDelta } from "@/components/people/NeutralDelta";
import { PersonEvidenceTable } from "@/components/people/PersonEvidenceTable";

const read = (p: string) =>
    readFileSync(join(process.cwd(), "src", p), "utf8").replace(/\s+/gu, " ");
const SEARCH = read("app/(app)/people/page.tsx");
const PERSON = read("app/(app)/people/[person_id]/page.tsx");
const METRIC = read("app/(app)/people/[person_id]/metrics/[metric]/page.tsx");
const CARD = read("components/people/PersonMetricCard.tsx");
const SEARCH_UI = read("components/people/PeopleSearch.tsx");

describe("People page pass (CHAOS-7762)", () => {
    it("P1: the search page title is People; the two lines stay", () => {
        expect(SEARCH).toContain('title="People"');
        expect(SEARCH).not.toContain('title="Individual metrics"');
        expect(SEARCH).toContain('subtitle="Individual metrics for a single-person view."');
    });

    it("the three service notices are page-load Notice warn with the production text", () => {
        expect(SEARCH).toMatch(
            /<Notice variant="warn" live=\{false\}> Data service unavailable\. Search results may be delayed until the API is back\. <\/Notice>/u,
        );
        expect(PERSON).toMatch(
            /<Notice variant="warn" live=\{false\}> Data service unavailable\. Metrics will refresh once the API is back\. <\/Notice>/u,
        );
        expect(METRIC).toMatch(
            /<Notice variant="warn" live=\{false\}> Data service unavailable\. Evidence will refresh once the API is back\. <\/Notice>/u,
        );
    });

    it("CHAOS-8152: the association 'Open evidence' link is the shared ghost small button with the arrow", () => {
        expect(METRIC).toContain('className={buttonClassName("ghost", "sm", "mt-2")}');
        expect(METRIC).toMatch(
            /<ArrowRight aria-hidden="true" className="h-3\.5 w-3\.5" \/> \{CTA_LABELS\.openEvidence\}/u,
        );
        expect(METRIC).not.toContain(
            "inline-flex text-xs uppercase tracking-[0.2em] text-(--accent-2)",
        );
    });

    it("P2: the 'View metric' list is gone", () => {
        expect(PERSON).not.toContain("View metric");
        expect(PERSON).not.toContain("Individual detail");
        expect(PERSON).not.toMatch(/PERSON_METRIC_KEYS\.map\(\(metric\) => \( <Link/u);
    });

    it.each(["cycle_time", "review_latency", "throughput", "churn", "wip_overlap", "blocked_work"])(
        "the tile of %s keeps its link to the metric page",
        (metric) => {
            expect(PERSON).toMatch(
                new RegExp(`const PERSON_METRIC_KEYS = \\[[^\\]]*"${metric}"`, "u"),
            );
            expect(PERSON).toContain("person_id: decodedPersonId");
            expect(PERSON).toContain("metric: delta.metric");
            expect(CARD).toContain('caption: "Open metric"');
        },
    );

    it("P4: the tile delta is the neutral component, not the good / bad MetricDelta", () => {
        expect(CARD).toContain("<NeutralDelta");
        expect(PERSON).not.toContain("delta={placeholderDeltas");
    });

    it("the Low coverage pill uses the production threshold (identityCoverage < 70)", () => {
        expect(PERSON).toContain("identityCoverage < 70");
        expect(PERSON).toMatch(
            /\{coverageLow && \( <span className=\{`[^`]*\$\{STATUS_PILL\.caution\}`\} > Low coverage <\/span> \)\}/u,
        );
        expect(PERSON).not.toContain("bg-amber-50");
    });

    it("the cards use token radii and no raw palette class", () => {
        for (const text of [SEARCH, PERSON, METRIC, SEARCH_UI]) {
            expect(text).not.toMatch(/rounded-(?:3xl|2xl)/u);
            expect(text).not.toMatch(
                /\b(?:text|bg|border)-(?:amber|emerald|rose|red|green|blue)-\d{2,3}/u,
            );
        }
    });

    it("P3: the metric page uses the typed evidence table, no JSON dump", () => {
        expect(METRIC).toContain("<PersonEvidenceTable");
        expect(METRIC).not.toContain("JSON.stringify");
    });
});

describe("NeutralDelta (P4)", () => {
    it.each([
        [12, "↑", "+12%"],
        [-8, "↓", "-8%"],
        [0, "→", "0%"],
    ])("%s shows %s and %s with no good / bad color", (value, arrow, text) => {
        const { container } = render(<NeutralDelta value={value} />);
        expect(container.textContent).toContain(arrow);
        expect(container.textContent).toContain(text);
        expect(container.innerHTML).not.toMatch(/positive|negative|green|red/u);
        expect(container.innerHTML).toContain("text-(--ink-muted)");
    });
    it("a missing prior period never reads as 0", () => {
        const { container } = render(<NeutralDelta value={undefined} />);
        expect(container).toHaveTextContent("No prior period");
        expect(container.textContent).not.toContain("0%");
    });
});

describe("PersonEvidenceTable (P3): typed columns from API fields; invented data", () => {
    it("pull requests: Item, Repository, State, Opened, Closed or merged", () => {
        const { container } = render(
            <PersonEvidenceTable
                type="prs"
                fallbackHref="/people/p1/metrics/cycle_time"
                items={[
                    {
                        repo_id: "repo-one",
                        number: 7,
                        title: "Fix the thing",
                        created_at: "2026-06-01T10:00:00Z",
                        merged_at: "2026-06-03T09:00:00Z",
                    },
                    {
                        repo_id: "repo-two",
                        number: 9,
                        title: null,
                        created_at: "2026-06-05T10:00:00Z",
                        merged_at: null,
                    },
                ]}
            />,
        );
        expect(Array.from(container.querySelectorAll("th")).map((th) => th.textContent)).toEqual([
            "Item",
            "Repository",
            "State",
            "Opened",
            "Closed or merged",
        ]);
        const rows = container.querySelectorAll("tbody tr");
        const first = within(rows[0] as HTMLElement);
        expect(first.getByText("Fix the thing")).toBeInTheDocument();
        expect(first.getByText("Merged")).toBeInTheDocument();
        expect(first.getByText("2026-06-01")).toBeInTheDocument();
        expect(first.getByText("2026-06-03")).toBeInTheDocument();
        const second = within(rows[1] as HTMLElement);
        expect(second.getByText("#9")).toBeInTheDocument();
        expect(second.getByText("Not merged")).toBeInTheDocument();
        expect(second.getByText("—")).toBeInTheDocument(); // no merge date: never invented
        expect(container.textContent).not.toContain("{");
    });

    it("issues: Item, Repositories, Provider, State, Opened, Closed; a missing field is a dash", () => {
        const { container } = render(
            <PersonEvidenceTable
                type="issues"
                fallbackHref="/x"
                items={[
                    {
                        work_item_id: "ISSUE-1",
                        provider: "jira",
                        status: "done",
                        started_at: "2026-06-02T00:00:00Z",
                        completed_at: null,
                    },
                ]}
            />,
        );
        expect(Array.from(container.querySelectorAll("th")).map((th) => th.textContent)).toEqual([
            "Item",
            "Repositories",
            "Provider",
            "State",
            "Opened",
            "Closed",
        ]);
        const row = within(container.querySelector("tbody tr") as HTMLElement);
        expect(row.getByText("jira")).toBeInTheDocument();
        expect(row.getByText("done")).toBeInTheDocument();
        expect(row.getByText("2026-06-02")).toBeInTheDocument();
        expect(row.getAllByText("—")).toHaveLength(2);
    });

    it("the item links to the record's own url, else to the fallback", () => {
        render(
            <PersonEvidenceTable
                type="prs"
                fallbackHref="/fallback"
                items={[{ title: "A", url: "https://example.test/pr/1" }, { title: "B" }]}
            />,
        );
        expect(screen.getByRole("link", { name: "A" })).toHaveAttribute(
            "href",
            "https://example.test/pr/1",
        );
        expect(screen.getByRole("link", { name: "B" })).toHaveAttribute("href", "/fallback");
    });
});

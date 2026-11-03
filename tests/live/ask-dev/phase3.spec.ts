import { readFileSync } from "node:fs";

import {
    expect,
    request as requestContext,
    test,
    type APIRequestContext,
    type Browser,
    type BrowserContext,
    type Locator,
    type Page,
} from "@playwright/test";

import { REPLICATES, richQuestionFor, type Replicate, type RichCase } from "./questions";
import {
    elapsedTimeMismatches,
    evidenceWindowText,
    headingMismatches,
    outcomeWordMismatches,
    servedShapes,
    tableMismatches,
    unitWordMismatches,
    type DrawnRow,
    type ServedShape,
} from "./rich-views";
import { ORACLE, ask, panel, signIn, watchResults } from "./stack";

/**
 * CHAOS-11946 (I-50): the Phase 3 live acceptance suite. Each rich view must render LIVE from the
 * answer's served `render_shapes`: the questions go to acr's `modeloracle` (scripted frames and
 * claims, never a real model, `make-plan.ts`), the data is the deployed org's own, and each drawn
 * view's value table must state every served point exactly, in served order.
 *
 * A view the answer did not serve is NOT CAPTURED and the case FAILS: a measurement that did not
 * happen never passes. A view behind a flag that is off on the stack is NOT RUN (skipped, never
 * passed): sankey (`ASK_DEV_LIVE_SANKEY=1`) and sunburst (`ASK_DEV_LIVE_SUNBURST=1`).
 *
 * Each answer also keeps the occurrence ledger: every drawn view's title is a served shape's
 * title, and a served shape that is not drawn is announced as withheld, never dropped in silence.
 */

const NONCE = process.env.ASK_DEV_LIVE_NONCE ?? "";
const SANKEY = process.env.ASK_DEV_LIVE_SANKEY === "1";
const SUNBURST = process.env.ASK_DEV_LIVE_SUNBURST === "1";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
/** Every withheld notice the render can show (ask-dev at web's pin). */
const WITHHELD = [
    "render-shapes-withheld",
    "rich-shape-withheld",
    "trend-shape-withheld",
    "forecast-shape-withheld",
    "forecast-percentiles-withheld",
    "comparison-table-withheld",
    "landscape-quadrant-withheld",
    "cohort-ranking-withheld",
].map((id) => `[data-testid="${id}"]`);

// Not serial: each case asks in its own panel, so one case that is NOT CAPTURED still lets every
// other case report (one worker, so they run in order).
test.describe.configure({ mode: "default" });

type Session = Awaited<ReturnType<BrowserContext["storageState"]>>;
type Served = Record<string, unknown> & {
    request_id?: string;
    result_id?: string;
    status?: string;
};
type Answer = { page: Page; surface: Locator; answer: Locator; result: Served };

let session: Session;
let oracle: APIRequestContext;

test.beforeAll(async ({ browser, baseURL }) => {
    expect(ORACLE, "ASK_DEV_LIVE_ORACLE is not set: no question may be sent").not.toBe("");
    expect(NONCE, "ASK_DEV_LIVE_NONCE is not set: run make-plan.ts for this run").not.toBe("");
    oracle = await requestContext.newContext();
    expect((await oracle.get(`${ORACLE}/health`)).status(), "the oracle is not up").toBe(204);
    const context = await browser.newContext({ baseURL: baseURL!, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await signIn(page);
    session = await context.storageState();
    await context.close();
});

// Each case makes one silent authorization, in its own tab: web allows one user 6 a minute
// (routed.spec.ts does the same). Without this wait, a case fails in `authorize` before it asks.
test.afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
});

test.afterAll(async () => {
    await oracle?.dispose();
});

/** Asks one case in a fresh panel and returns the drawn answer with the result it was served. */
async function answerFor(
    browser: Browser,
    baseURL: string | undefined,
    name: RichCase,
    replicate: Replicate,
): Promise<Answer> {
    const context = await browser.newContext({
        baseURL: baseURL!,
        storageState: session,
        ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    const results = await watchResults(page);
    const { surface } = await panel(page);
    await ask(surface, richQuestionFor(name, replicate, NONCE));
    const answer = surface.getByRole("article", { name: "Answer" });
    await expect(answer).toHaveCount(1, { timeout: 90_000 });
    await expect
        .poll(() => results.length, {
            // The answer article is drawn while the run streams; its terminal result can come
            // later (a fresh synthesis), so this waits as long as the answer itself may take.
            message: "the stream served no terminal result",
            timeout: 90_000,
        })
        .toBeGreaterThan(0);
    const result = results.at(-1) as unknown as Served;
    // The run ids this case is evidence for (TEST-EVIDENCE).
    console.log(`run ${name}${String(replicate)}: ${describeServed(result)}`);
    test.info().annotations.push({
        type: "run",
        description: `${name}${String(replicate)}: ${String(result.request_id)} → ${String(result.result_id)} (${String(result.status)}), ${String(servedShapes(result).length)} shapes`,
    });
    return { page, surface, answer, result };
}

/** The served shapes of one rule; none is NOT CAPTURED, which fails the case. */
function served(result: Served, rule: string, why: string): ServedShape[] {
    const shapes = servedShapes(result).filter((shape) => shape.selected_by === rule);
    expect(
        shapes.length,
        `NOT CAPTURED: the answer served no ${rule} shape (${why}). ${describeServed(result)}`,
    ).toBeGreaterThan(0);
    return shapes;
}

/** What the answer DID serve, for a NOT CAPTURED message: its ids, status, shapes, claims and fact sources. */
function describeServed(result: Served): string {
    const claims = (
        (result.claimed_facts as { kind?: string; field?: string }[] | undefined) ?? []
    ).map((claim) => `${String(claim.kind)}.${String(claim.field)}`);
    const sources = (
        ((result.coverage as { sources?: { source?: string; state?: string }[] } | undefined)
            ?.sources ?? []) as { source?: string; state?: string }[]
    )
        .filter((source) => String(source.source).startsWith("canonical_fact:"))
        .map(
            (source) =>
                `${String(source.source).slice("canonical_fact:".length)}=${String(source.state)}`,
        );
    return [
        `result ${String(result.result_id)} (${String(result.request_id)}), status ${String(result.status)}`,
        `shapes [${servedShapes(result)
            .map((shape) => shape.selected_by)
            .join(", ")}]`,
        `claims [${claims.join(", ")}]`,
        `fact sources [${sources.join(", ")}]`,
    ].join("; ");
}

/** The rows of a value table, as the reader gets them: row header, then each cell. */
const rowsOf = (table: Locator): Promise<DrawnRow[]> =>
    table.locator("tbody tr").evaluateAll((rows) =>
        rows.map((row) => ({
            label: (row.querySelector("th")?.textContent ?? "").trim(),
            cells: [...row.querySelectorAll("td")].map((cell) => (cell.textContent ?? "").trim()),
        })),
    );

/** The value columns' headings (the first column is the axis), without their unit words. */
const headingsOf = (table: Locator): Promise<string[]> =>
    table.locator("thead th").evaluateAll((cells) =>
        cells.slice(1).map((cell) => {
            const copy = cell.cloneNode(true) as HTMLElement;
            for (const unit of copy.querySelectorAll('[data-testid="measure-unit"]')) unit.remove();
            return (copy.textContent ?? "").trim();
        }),
    );

/** The one drawn figure whose caption IS a served shape's title (exact, never a substring). */
const figureOf = (answer: Locator, shape: ServedShape): Locator =>
    answer.locator("figure").filter({
        has: answer.page().locator("figcaption").getByText(shape.title, { exact: true }),
    });

/** A drawn chart's value table must state the served shape exactly. */
async function expectDrawnAsServed(
    figure: Locator,
    shape: ServedShape,
    ranks?: ReadonlyMap<string, number>,
): Promise<void> {
    await expect(figure, `no drawn view captions "${shape.title}"`).toHaveCount(1);
    await expect(figure.getByTestId("rich-shape-not-shown")).toHaveCount(0);
    const table = figure.locator("table").first();
    await expect(table).toHaveCount(1);
    expect(tableMismatches(shape, await rowsOf(table), ranks), shape.title).toEqual([]);
    expect(headingMismatches(shape, await headingsOf(table)), shape.title).toEqual([]);
}

/**
 * The occurrence ledger of one answer: every drawn view's title is a served title, and a served
 * shape with no drawn view is announced by a withheld notice.
 */
async function expectLedger(answer: Locator, result: Served): Promise<void> {
    const shapes = servedShapes(result);
    const titles = new Set(shapes.map((shape) => shape.title));
    const drawnTitles = (await answer.locator("figure figcaption").allTextContents()).map((title) =>
        title.trim(),
    );
    for (const title of drawnTitles) {
        expect(titles.has(title), `drawn view "${title}" captions no served shape`).toBe(true);
    }
    // A panel view has no figure caption: each served one must have its own panel.
    const comparisons = shapes.filter((shape) => shape.selected_by === "comparison_side_by_side");
    if (comparisons.length > 0) {
        await expect(answer.getByTestId("comparison-table")).toHaveCount(comparisons.length);
    }
    if (shapes.some((shape) => shape.selected_by === "completion_forecast_percentiles")) {
        await expect(answer.getByTestId("forecast-percentiles")).toHaveCount(1);
    }
    const notDrawn = shapes.filter(
        (shape) => !drawnTitles.includes(shape.title) && !panelRules.has(shape.selected_by),
    );
    if (notDrawn.length > 0) {
        await expect(
            answer.locator(WITHHELD.join(", ")).first(),
            `served but neither drawn nor announced withheld: ${notDrawn.map((shape) => shape.title).join("; ")}`,
        ).toBeVisible();
    }
}

/** Rules whose view is a panel with a heading, not a captioned figure. */
const panelRules = new Set(["comparison_side_by_side", "completion_forecast_percentiles"]);

type Labels = Record<string, string>;
const labelsOf = (result: Served): Labels => (result.vocabulary_labels as Labels | undefined) ?? {};

/**
 * AC-7 and AC-8: the answer's window line states the served window, or says it was not reported.
 * Dates are formatted by the page itself, so the comparison runs in the browser's locale.
 */
async function expectWindowLine(page: Page, answer: Locator, result: Served): Promise<void> {
    const window = result.effective_evidence_window as
        { start?: string; end?: string; relative_id?: string; as_of?: string } | undefined;
    const isos = [window?.start, window?.end, window?.as_of].filter(
        (iso): iso is string => iso !== undefined,
    );
    const days = await page.evaluate(
        (list) =>
            Object.fromEntries(
                list.map((iso) => {
                    const date = new Date(iso);
                    return [
                        iso,
                        Number.isNaN(date.getTime())
                            ? iso
                            : date.toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                              }),
                    ];
                }),
            ),
        isos,
    );
    const line = answer.getByTestId("coverage-evidence-window").first();
    await expect(line, "the answer states its evidence window").toHaveCount(1);
    expect((await line.textContent())?.trim()).toBe(
        evidenceWindowText(window, labelsOf(result), (iso) => days[iso] ?? iso),
    );
}

async function axeViolations(page: Page, selector: string): Promise<string[]> {
    await page.evaluate(readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"));
    return page.evaluate(
        async ({ selector, tags }) => {
            const node = document.querySelector(selector);
            if (node === null) return [`${selector} is not on the page`];
            // @ts-expect-error axe is injected above.
            const outcome = await window.axe.run(node, { runOnly: { type: "tag", values: tags } });
            return (outcome.violations as { id: string; nodes: unknown[] }[]).map(
                (violation) => `${violation.id}: ${String(violation.nodes.length)}`,
            );
        },
        { selector, tags: AXE_TAGS },
    );
}

for (const replicate of REPLICATES) {
    test(`forecast ${String(replicate)}: the completion curve and its dated trend render from the served shapes`, async ({
        browser,
        baseURL,
    }) => {
        const { page, answer, result } = await answerFor(browser, baseURL, "forecast", replicate);
        const [curve] = served(result, "completion_forecast", "one team scope claimed");
        await expectDrawnAsServed(figureOf(answer, curve!), curve!);

        // AC-2 live part: the dated trend sits on an elapsed-time axis.
        for (const trend of served(
            result,
            "dated_fact_trend",
            "the claimed workload fact is dated",
        )) {
            const figure = figureOf(answer, trend);
            await expectDrawnAsServed(figure, trend);
            const series = trend.series[0]!;
            const marks = await Promise.all(
                series.points.map(async (point) => {
                    const box = await figure
                        .locator(`svg [aria-label^="${point.label}, ${series.label}: "]`)
                        .first()
                        .boundingBox();
                    return {
                        label: point.label,
                        x: box === null ? Number.NaN : box.x + box.width / 2,
                    };
                }),
            );
            expect(
                marks.filter((mark) => Number.isNaN(mark.x)).map((mark) => mark.label),
                "served points with no drawn mark",
            ).toEqual([]);
            expect(elapsedTimeMismatches(marks), trend.title).toEqual([]);
        }
        // AC-8: the claimed-fact table states units only as served, and the answer its window.
        await expect(answer.locator("table.fact-table").first()).toHaveCount(1);
        const claims = (result.claimed_facts as Parameters<typeof unitWordMismatches>[0]) ?? [];
        const drawnUnits = await answer
            .locator('table.fact-table thead [data-testid="measure-unit"]')
            .allTextContents();
        expect(unitWordMismatches(claims, labelsOf(result), drawnUnits)).toEqual([]);
        test.info().annotations.push({
            type: "AC-8",
            description: `unit words drawn [${drawnUnits.join(", ")}]; window ${JSON.stringify(result.effective_evidence_window ?? null)}`,
        });
        expect(
            result.effective_evidence_window,
            "the forecast answer serves its window",
        ).toBeDefined();
        await expectWindowLine(page, answer, result);
        await expectLedger(answer, result);
        // AC-4: the panel with its charts open passes axe AA.
        expect(await axeViolations(page, '[data-testid="ask-dev-panel"]')).toEqual([]);
        await page.context().close();
    });

    test(`treemap ${String(replicate)}: the investment theme share renders from the served shape`, async ({
        browser,
        baseURL,
    }) => {
        const { page, answer, result } = await answerFor(browser, baseURL, "treemap", replicate);
        for (const shape of served(
            result,
            "investment_theme_share",
            "the repository's theme breakdown",
        )) {
            await expectDrawnAsServed(figureOf(answer, shape), shape);
        }
        await expectLedger(answer, result);
        await page.context().close();
    });

    test(`comparison ${String(replicate)}: the side-by-side table renders from the served shape`, async ({
        browser,
        baseURL,
    }) => {
        const { page, answer, result } = await answerFor(browser, baseURL, "comparison", replicate);
        const [shape] = served(result, "comparison_side_by_side", "both teams' landscape claims");
        const section = answer.getByTestId("comparison-table");
        await expect(section).toHaveCount(1);
        await expect(answer.getByTestId("comparison-table-withheld")).toHaveCount(0);
        // The visible table may round; when it does, the exact values are in the fold beside it.
        const exact = section.getByTestId("comparison-table-exact");
        const table = ((await exact.count()) > 0 ? exact : section).locator("table").first();
        expect(tableMismatches(shape!, await rowsOf(table)), shape!.title).toEqual([]);
        expect(headingMismatches(shape!, await headingsOf(table)), shape!.title).toEqual([]);
        await expectLedger(answer, result);
        await page.context().close();
    });

    test(`window ${String(replicate)}: an answer with no window says so, and states no guessed one`, async ({
        browser,
        baseURL,
    }) => {
        // AC-7: a non-current axis (a stated date range) composes no effective window
        // (acr window.go: composeEffectiveWindowForFrame), and the server fills a default only on
        // the current axis. The answer must then say the window was not reported.
        const { page, answer, result } = await answerFor(browser, baseURL, "window", replicate);
        expect(
            result.effective_evidence_window,
            "NOT CAPTURED: the answer served a window, so a missing one cannot be shown",
        ).toBeUndefined();
        await expectWindowLine(page, answer, result);
        await expectLedger(answer, result);
        await page.context().close();
    });

    test(`quadrant ${String(replicate)} [KNOWN GAP CHAOS-12676]: the landscape position renders from the served shape`, async ({
        browser,
        baseURL,
    }) => {
        const { page, answer, result } = await answerFor(browser, baseURL, "landscape", replicate);
        // The preconditions are ordinary assertions: a broken answer is red, never an expected failure.
        const landscapeClaims = (
            (result.claimed_facts as
                { kind?: string; subject?: { canonical_id?: string } }[] | undefined) ?? []
        ).filter((claim) => claim.kind === "landscape");
        expect(
            new Set(landscapeClaims.map((claim) => claim.subject?.canonical_id)).size,
            "both teams' landscape claims are served",
        ).toBe(2);
        test.info().annotations.push({
            type: "KNOWN GAP",
            description:
                "CHAOS-12676: no two owner teams hold landscape rows on the same newest day, so acr skips the quadrant (landscape_days_differ, read from acr's render-shape selection log, which the answer does not carry). Never a pass.",
        });
        const quadrant = answer.getByTestId("landscape-quadrant");
        const quadrantServed = servedShapes(result).some(
            (shape) => shape.selected_by === "landscape_position",
        );
        if (!quadrantServed) {
            // Expected to fail while the gap holds, on THE assertion that fails today: the quadrant
            // is drawn.
            test.fail(true, "KNOWN GAP CHAOS-12676: the answer serves no quadrant");
            await expect(quadrant, "KNOWN GAP CHAOS-12676: the quadrant is drawn").toHaveCount(1);
        }
        // Served: it must be drawn as served (a real failure if not), and then the case fails loudly,
        // because CHAOS-12676 no longer holds and this case must become an ordinary one.
        const [shape] = served(
            result,
            "landscape_position",
            "both teams must hold landscape rows on one day (CHAOS-12676)",
        );
        await expect(quadrant).toHaveCount(1);
        await expectDrawnAsServed(figureOf(quadrant, shape!), shape!);
        expect(
            quadrantServed,
            "CHAOS-12676 no longer holds: the quadrant is served and drawn; flip this case to an ordinary one",
        ).toBe(false);
        await page.context().close();
    });

    test(`cohort ${String(replicate)}: the ranking and its charts render in served rank order`, async ({
        browser,
        baseURL,
    }) => {
        const { page, answer, result } = await answerFor(browser, baseURL, "cohort", replicate);
        const members =
            (
                result.cohort as
                    | {
                          members?: {
                              subject: { canonical_id: string; label: string };
                              attention_rank?: number;
                          }[];
                      }
                    | undefined
            )?.members ?? [];
        const ranked = members
            .filter((member) => typeof member.attention_rank === "number")
            .sort((left, right) => left.attention_rank! - right.attention_rank!);
        expect(
            ranked.length,
            "AC-10: a cohort of at least three ranked teams",
        ).toBeGreaterThanOrEqual(3);
        const ranks = new Map(
            ranked.map((member) => [member.subject.canonical_id, member.attention_rank!]),
        );

        const ranking = answer.getByTestId("cohort-ranking-panel");
        await expect(ranking).toHaveCount(1);
        // AC-9: the drawn rows are in the served rank order.
        const rowIds = await ranking
            .getByTestId("ranking-row")
            .evaluateAll((rows) =>
                rows.map(
                    (row) =>
                        row.querySelector("[data-subject-id]")?.getAttribute("data-subject-id") ??
                        "",
                ),
            );
        expect(rowIds).toEqual(ranked.map((member) => member.subject.canonical_id));
        const alphabetical = [...ranked].sort((left, right) =>
            left.subject.label.localeCompare(right.subject.label),
        );
        test.info().annotations.push({
            type: "AC-9",
            description: alphabetical.every((member, index) => member === ranked[index])
                ? "NOT MET in this replicate: the served rank order is alphabetical"
                : "served rank order differs from the alphabetical order",
        });

        // AC-11: teams, projects and repositories only, and each outcome in its own served word.
        const kinds = (members as { subject: { kind?: string } }[]).map(
            (member) => member.subject.kind,
        );
        expect(
            kinds.filter((kind) => !["team", "project", "repository"].includes(String(kind))),
            "a cohort member that is not a team, project or repository",
        ).toEqual([]);
        const drawnOutcomes = await ranking.getByTestId("ranking-row").evaluateAll((rows) =>
            rows.map((row) => {
                // The outcome is the row's fourth cell (rank, subject, score, outcome, ...).
                const cell = row.querySelectorAll("td")[3];
                const badge = cell?.querySelector(".badge[data-value]") ?? null;
                return {
                    drawnValue: badge?.getAttribute("data-value") ?? null,
                    drawnWord: ((badge ?? cell)?.textContent ?? "").trim(),
                };
            }),
        );
        expect(drawnOutcomes.length).toBe(ranked.length);
        expect(
            outcomeWordMismatches(
                ranked.map((member, index) => ({
                    outcome: (member as { outcome?: string }).outcome,
                    ...drawnOutcomes[index]!,
                })),
                labelsOf(result),
            ),
        ).toEqual([]);
        test.info().annotations.push({
            type: "AC-11",
            description: `outcomes drawn [${drawnOutcomes.map((row) => `${String(row.drawnValue)}=${row.drawnWord}`).join(", ")}]`,
        });

        // AC-1 and AC-10: no bare score. A row that shows a score shows the drivers behind it;
        // a row with no drivers shows its score withheld.
        const bareScores = await ranking.getByTestId("ranking-row").evaluateAll((rows) =>
            rows
                .map((row, index) => {
                    const score = (row.querySelectorAll("td")[2]?.textContent ?? "").trim();
                    const drivers = row.querySelectorAll("ul.ranking__drivers li").length;
                    const shown = score !== "" && score !== "—" && score !== "withheld";
                    return shown && drivers === 0
                        ? `row ${String(index + 1)}: score ${score} with no drivers`
                        : "";
                })
                .filter((line) => line !== ""),
        );
        expect(bareScores, "a score shown with no driver behind it").toEqual([]);

        // AC-1: the attention bars and the driver contribution stack, in rank order.
        for (const rule of ["cohort_attention_score", "cohort_driver_contribution"]) {
            for (const shape of served(result, rule, "a ranked team cohort")) {
                await expectDrawnAsServed(figureOf(ranking, shape), shape, ranks);
            }
        }
        await expectLedger(answer, result);
        // AC-4: /dev with the charts open passes axe AA.
        await page.getByRole("button", { name: "Open full page" }).click();
        await expect(page.getByTestId("ask-dev-page")).toBeVisible({ timeout: 30_000 });
        expect(await axeViolations(page, '[data-testid="ask-dev-page"]')).toEqual([]);
        await page.context().close();
    });
}

test("sankey: the repository flow renders from the served shape", () => {
    if (!SANKEY) {
        // Listed as NOT RUN by ci/live-e2e-skip-gate.mjs, never as a pass or a plain skip.
        test.info().annotations.push({
            type: "NOT RUN",
            description:
                "the sankey flag is off on this stack (ASK_DEV_LIVE_SANKEY); on with web-sankey's roll (#1974)",
        });
    }
    test.skip(!SANKEY, "NOT RUN: the sankey flag is off on this stack (ASK_DEV_LIVE_SANKEY)");
    // Turned on with web-sankey's roll (#1974): the case is written then, against a served flow.
    expect(SANKEY, "NOT RUN: the sankey case has no question yet").toBe(false);
});

test("sunburst: the investment subcategories render from the served shape", () => {
    if (!SUNBURST) {
        test.info().annotations.push({
            type: "NOT RUN",
            description:
                "the sunburst flag is off on this stack (ASK_DEV_LIVE_SUNBURST); on with acr #2002 and web's ask-dev pin (#1797)",
        });
    }
    test.skip(!SUNBURST, "NOT RUN: the sunburst flag is off on this stack (ASK_DEV_LIVE_SUNBURST)");
    // Turned on with acr #2002 and web's ask-dev pin bump (#1797): the case is written then.
    expect(SUNBURST, "NOT RUN: the sunburst case has no question yet").toBe(false);
});

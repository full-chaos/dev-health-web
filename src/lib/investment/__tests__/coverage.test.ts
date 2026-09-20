import { describe, expect, it } from "vitest";
import { readFlowCoverage } from "../coverage";
import type { SankeyResponse } from "@/lib/types";

const flow = (extra: Record<string, unknown>): SankeyResponse =>
    ({ mode: "investment", nodes: [], links: [], ...extra }) as SankeyResponse;

// Value states x leaf: number, 0, null, absent, non-finite, fallback field.
describe("readFlowCoverage — missing is not zero", () => {
    const cases: Array<[string, SankeyResponse | null | undefined, number | null, number | null]> =
        [
            ["no flow (null)", null, null, null],
            ["no flow (undefined)", undefined, null, null],
            ["coverage absent", flow({}), null, null],
            ["coverage null", flow({ coverage: null }), null, null],
            ["number", flow({ coverage: { team: 0.85, repo: 0.72 } }), 0.85, 0.72],
            ["produced 0", flow({ coverage: { team: 0, repo: 0 } }), 0, 0],
            ["null leaf", flow({ coverage: { team: null, repo: 0.5 } }), null, 0.5],
            ["absent leaf", flow({ coverage: { repo: 0.5 } }), null, 0.5],
            ["NaN leaf", flow({ coverage: { team: Number.NaN, repo: 0.5 } }), null, 0.5],
            ["Infinity leaf", flow({ coverage: { team: 0.5, repo: Infinity } }), 0.5, null],
            ["string leaf", flow({ coverage: { team: "0.5", repo: 0.5 } }), null, 0.5],
            ["REST fallback number", flow({ team_coverage: 0.3, repo_coverage: 0.2 }), 0.3, 0.2],
            ["REST fallback null", flow({ team_coverage: null, repo_coverage: null }), null, null],
            [
                "coverage wins over REST fallback, 0 included",
                flow({ coverage: { team: 0, repo: 0 }, team_coverage: 0.9, repo_coverage: 0.9 }),
                0,
                0,
            ],
        ];

    it.each(cases)("%s", (_name, input, team, repo) => {
        expect(readFlowCoverage(input)).toEqual({ team, repo });
    });
});

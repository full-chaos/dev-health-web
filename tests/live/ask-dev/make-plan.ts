/**
 * Writes one run's plan for acr's `modeloracle` from acr's I-48 plan: one entry per case, with that
 * run's nonce in the question.
 *
 *   npx tsx tests/live/ask-dev/make-plan.ts <acr plan> <output> <nonce>
 */
import { readFileSync, writeFileSync } from "node:fs";

import { CASES, questionFor, type QuestionCase } from "./questions";

type Entry = { question: string; interpretation: Record<string, unknown> };
type Plan = { service: { questions: Entry[] } };

const [source, output, nonce] = process.argv.slice(2);
if (!source || !output || !nonce) throw new Error("usage: make-plan <acr plan> <output> <nonce>");

const plan = JSON.parse(readFileSync(source, "utf8")) as Plan;
const entries = (Object.keys(CASES) as QuestionCase[]).map((name) => {
    const entry = plan.service.questions.find((item) => item.question === CASES[name]);
    if (entry === undefined) throw new Error(`acr's plan has no entry for: ${CASES[name]}`);
    return {
        ...entry,
        question: questionFor(name, nonce),
        interpretation: {
            ...entry.interpretation,
            window_class: "recent_activity_lookup",
            window_confidence: "high",
        },
    };
});
writeFileSync(output, JSON.stringify({ ...plan, service: { questions: entries } }, null, 2));

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import forbidden from "../../../../tests/fixtures/ask-dev/scrub-forbidden.sha256.json";

/**
 * CHAOS-12159. dev-health-web is public: a capture fixture must not hold the organisation values
 * scrubbed from it (internal UUIDs, the organisation id, team and project names, free-text titles,
 * the team's tracker key). The forbidden values are kept only as sha256 hashes of their lower-cased
 * form; every string in every capture file (object keys too) is checked as a whole, by UUID, by
 * 8-hex token, by word n-gram and by tracker-key form, so a value inside a sentence, an id or an
 * encoded reference is caught as well.
 */
const CAPTURES = join(__dirname, "../../../../tests/fixtures/ask-dev/captures");
const FORBIDDEN = new Set(forbidden.sha256);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
const HEX8 = /(?<![0-9a-z])[0-9a-f]{8}(?![0-9a-z])/giu;
const MAX_NGRAM = 8;
/** `<key>-<n>` issue keys, also behind an encoded colon (`extkey%3A<key>-<n>`). */
const ISSUE_KEY = /(?<![a-z0-9])([a-z][a-z0-9]{1,9})-\d{1,7}(?![a-z0-9])/gu;
/** A tracker team key in a reference (`linear:<key>`, `linear%3A<key>`). */
const LINEAR_KEY = /linear:([a-z0-9]+)/gu;

const sha256 = (value: string) => createHash("sha256").update(value.toLowerCase()).digest("hex");

function stringsOf(value: unknown, out: string[] = []): string[] {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) for (const item of value) stringsOf(item, out);
    else if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
            out.push(key);
            stringsOf(item, out);
        }
    }
    return out;
}

function ngrams(words: readonly string[]): string[] {
    const grams: string[] = [];
    for (let start = 0; start < words.length; start++) {
        for (let size = 1; size <= MAX_NGRAM && start + size <= words.length; size++) {
            grams.push(words.slice(start, start + size).join(" "));
        }
    }
    return grams;
}

/** Every candidate form of one string that a forbidden hash could match. */
function candidates(text: string): string[] {
    const lower = text.toLowerCase();
    const spaced = lower.split(/\s+/u).filter(Boolean);
    const stripped = spaced.map((w) =>
        w.replace(/^["'(]+|(?:'s)?["',.;:!?)]+$/gu, "").replace(/'s$/u, ""),
    );
    const alnum = lower.split(/[^a-z0-9]+/u).filter(Boolean);
    const decoded = lower.replaceAll("%3a", ":");
    // Tagged forms: a tracker key is a plain word too (it can sit inside a public repo slug), so it
    // is only forbidden where it acts as a key.
    const keyPrefixes = [...decoded.matchAll(ISSUE_KEY)].map((m) => `keyprefix:${m[1]}`);
    const linearKeys = [...decoded.matchAll(LINEAR_KEY)].map((m) => `linearkey:${m[1]}`);
    return [
        lower,
        ...(lower.match(UUID) ?? []),
        ...(lower.match(HEX8) ?? []),
        ...ngrams(spaced),
        ...ngrams(stripped),
        // Single words only: an identifier such as `claim_<team>_backlog` holds a name as one
        // word, while multi-word runs of a public repo slug (`full-chaos/dev-health-ops`) may
        // spell a project name and are allowed.
        ...alnum,
        ...keyPrefixes,
        ...linearKeys,
    ];
}

const files = [
    ...readdirSync(CAPTURES)
        .filter((file) => file.endsWith(".json"))
        .map((file) => join(CAPTURES, file)),
];

describe("capture fixtures hold no scrubbed org value (CHAOS-12159)", () => {
    it("has a forbidden list and capture files to check", () => {
        expect(FORBIDDEN.size).toBeGreaterThan(300);
        // 29 captures: the 19 of the deleted web render's oracle went with it (CHAOS-12384).
        expect(files.length).toBeGreaterThan(25);
    });

    it.each(files.map((file) => [relative(join(__dirname, "../../../../.."), file), file]))(
        "%s holds none of the forbidden values",
        (_name, file) => {
            const strings = stringsOf(JSON.parse(readFileSync(file, "utf8")));
            const hits = new Set<string>();
            for (const text of strings) {
                for (const candidate of candidates(text)) {
                    const digest = sha256(candidate);
                    if (FORBIDDEN.has(digest)) hits.add(digest.slice(0, 12));
                }
            }
            // The digest prefix names the hit without printing the value.
            expect([...hits]).toEqual([]);
        },
    );
});

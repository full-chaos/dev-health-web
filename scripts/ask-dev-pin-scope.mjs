#!/usr/bin/env node
// Prints `enforce=true|false`, `base_pin=` and `pr_pin=` for a pull request (CHAOS-12393).
// A PR must pass the ask-dev pin check (enforce) only when it moves the pin. Any other PR sees drift
// as advisory, so an ask-dev main move never turns unrelated PRs red. A moved pin is what must not
// go unseen, so the workflow names both SHAs on the run.
//
// Usage: node scripts/ask-dev-pin-scope.mjs <the base branch's package.json> [<the PR's package.json>]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PACKAGE_NAME, pinOf } from "./check-ask-dev-pin-drift.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A base branch with no dependency yet has no pin; any other bad spec still throws. */
function basePin(packageJsonText) {
    if (JSON.parse(packageJsonText).dependencies?.[PACKAGE_NAME] === undefined) return "none";
    return pinOf(packageJsonText);
}

export function pinMove(baseText, prText) {
    const base_pin = basePin(baseText);
    const pr_pin = pinOf(prText);
    return { enforce: base_pin !== pr_pin, base_pin, pr_pin };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [baseFile, prFile = path.join(ROOT, "package.json")] = process.argv.slice(2);
    const move = pinMove(fs.readFileSync(baseFile, "utf8"), fs.readFileSync(prFile, "utf8"));
    process.stdout.write(
        Object.entries(move)
            .map(([key, value]) => `${key}=${value}\n`)
            .join(""),
    );
}

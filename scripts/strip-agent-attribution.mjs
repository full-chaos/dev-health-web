#!/usr/bin/env node
/**
 * Strip agent-attribution trailers from a commit message file.
 *
 * Invoked by the lefthook `commit-msg` hook on every `git commit`.
 *
 * The repo-root `AGENTS.md` rule states: "Never add contribution attribution
 * for agents in commits." Sisyphus, oh-my-openagent, Claude Code, and similar
 * AI coding agents inject `Ultraworked with [...]` and
 * `Co-authored-by: <agent>` trailers into commit messages despite the rule.
 *
 * This hook removes them before the commit lands so `main` stays clean.
 *
 * Usage:
 *
 *   node scripts/strip-agent-attribution.mjs <commit-msg-file>
 *
 * Behaviour:
 * - Idempotent: running on a clean message is a no-op.
 * - Preserves all other trailers (real `Co-authored-by` for humans,
 *   `Signed-off-by`, `Refs`, `Closes`, etc.).
 * - Collapses runs of blank lines created by removal back to a single blank.
 *
 * Exit codes:
 * - 0: message rewritten (or unchanged); commit proceeds.
 * - 1: file is unreadable or unwritable.
 * - 2: argv is malformed.
 *
 * The matching JS implementation in scripts/ keeps the web repo Python-free.
 * The equivalent Python version lives in dev-health-ops under
 * scripts/strip_agent_attribution.py.
 */

import { readFileSync, writeFileSync } from "node:fs";

// Patterns that match agent-attribution lines. Each one matches a single full
// line including optional surrounding whitespace; we run them in MULTILINE mode
// so `^`/`$` anchor to line boundaries.
const AGENT_LINE_PATTERNS = [
  // "Ultraworked with [Sisyphus](https://...)"
  /^Ultraworked with \[[^\]]+\]\([^)]*\)\s*$/gm,
  // "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
  /^Co-authored-by:\s+Sisyphus\s+<[^>]*>\s*$/gm,
  // "Co-authored-by: Claude <noreply@anthropic.com>"
  /^Co-authored-by:\s+Claude\s+<[^>]*>\s*$/gm,
  // "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
  /^🤖 Generated with \[?[^\]\n]+\]?\([^)]*\)?\s*$/gm,
];

/**
 * Return `message` with agent-attribution lines removed.
 * Pure function; exported for unit tests.
 *
 * @param {string} message
 * @returns {string}
 */
export function stripAgentAttribution(message) {
  let cleaned = message;
  for (const pattern of AGENT_LINE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  // Collapse runs of 3+ blank lines to a single blank line.
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  // Ensure exactly one trailing newline.
  return cleaned.replace(/\s+$/, "") + "\n";
}

/**
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv) {
  if (argv.length !== 1) {
    process.stderr.write("usage: strip-agent-attribution.mjs <commit-msg-file>\n");
    return 2;
  }
  const path = argv[0];
  let original;
  try {
    original = readFileSync(path, "utf8");
  } catch (err) {
    process.stderr.write(`strip-agent-attribution: cannot read ${path}: ${err.message}\n`);
    return 1;
  }
  const cleaned = stripAgentAttribution(original);
  if (cleaned !== original) {
    try {
      writeFileSync(path, cleaned);
    } catch (err) {
      process.stderr.write(`strip-agent-attribution: cannot write ${path}: ${err.message}\n`);
      return 1;
    }
  }
  return 0;
}

// CLI entrypoint: only run when invoked directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}

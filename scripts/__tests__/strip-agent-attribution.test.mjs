import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { main, stripAgentAttribution } from "../strip-agent-attribution.mjs";

describe("stripAgentAttribution", () => {
  it("strips the Sisyphus trailer pair", () => {
    const msg = [
      "feat(web): add product telemetry foundation (CHAOS-1789)",
      "",
      "Adds typed event catalog, sanitizer, queue, adapter.",
      "",
      "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)",
      "",
      "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>",
      "",
    ].join("\n");
    const cleaned = stripAgentAttribution(msg);
    expect(cleaned).not.toMatch(/Sisyphus/);
    expect(cleaned).not.toMatch(/Ultraworked/);
    expect(cleaned).not.toMatch(/clio-agent/);
    expect(cleaned).toBe(
      [
        "feat(web): add product telemetry foundation (CHAOS-1789)",
        "",
        "Adds typed event catalog, sanitizer, queue, adapter.",
        "",
      ].join("\n"),
    );
  });

  it("strips the Claude Code trailer pair", () => {
    const msg = [
      "fix(web): handle missing org id in telemetry envelope",
      "",
      "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
      "",
      "Co-authored-by: Claude <noreply@anthropic.com>",
      "",
    ].join("\n");
    const cleaned = stripAgentAttribution(msg);
    expect(cleaned).not.toMatch(/Claude/);
    expect(cleaned).not.toMatch(/🤖/);
    expect(cleaned.trim()).toBe("fix(web): handle missing org id in telemetry envelope");
  });

  it("preserves real-human Co-authored-by trailers", () => {
    const msg = [
      "feat(metrics): wire DORA dashboard tile (CHAOS-1234)",
      "",
      "Co-authored-by: Alex Real-Human <alex@example.com>",
      "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>",
      "",
    ].join("\n");
    const cleaned = stripAgentAttribution(msg);
    expect(cleaned).toMatch(/Co-authored-by: Alex Real-Human <alex@example\.com>/);
    expect(cleaned).not.toMatch(/Sisyphus/);
  });

  it("preserves Signed-off-by, Refs, and Closes", () => {
    const msg = [
      "fix(api): drop nullable sort key (CHAOS-450)",
      "",
      "Refs CHAOS-450",
      "Closes CHAOS-786",
      "Signed-off-by: Real Person <real@example.com>",
      "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)",
      "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>",
      "",
    ].join("\n");
    const cleaned = stripAgentAttribution(msg);
    expect(cleaned).toMatch(/Refs CHAOS-450/);
    expect(cleaned).toMatch(/Closes CHAOS-786/);
    expect(cleaned).toMatch(/Signed-off-by: Real Person/);
    expect(cleaned).not.toMatch(/Sisyphus/);
    expect(cleaned).not.toMatch(/Ultraworked/);
  });

  it("is idempotent on a clean message", () => {
    const msg = "chore(deps): bump prettier to 3.9.0\n\nNo behaviour change.\n";
    expect(stripAgentAttribution(msg)).toBe(msg);
  });

  it("collapses runs of 3+ blank lines", () => {
    const msg = [
      "subject",
      "",
      "body line",
      "",
      "",
      "",
      "Ultraworked with [Sisyphus](https://example.com/x)",
      "Co-authored-by: Sisyphus <agent@example.com>",
      "",
    ].join("\n");
    const cleaned = stripAgentAttribution(msg);
    expect(cleaned).not.toMatch(/\n\n\n/);
    expect(cleaned.endsWith("body line\n")).toBe(true);
  });

  it.each([
    "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>",
    "Co-authored-by: Sisyphus <other-agent@example.org>",
    "Co-authored-by: Claude <noreply@anthropic.com>",
    "Ultraworked with [SomeAgent](https://example.com)",
  ])("strips known agent line: %s", (agentLine) => {
    const msg = `subject\n\nbody\n\n${agentLine}\n`;
    const cleaned = stripAgentAttribution(msg);
    expect(cleaned).not.toMatch(new RegExp(agentLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

describe("main", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "strip-agent-attr-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("rewrites the commit-msg file in place when trailers present", () => {
    const path = join(tmpDir, "COMMIT_EDITMSG");
    writeFileSync(
      path,
      [
        "feat: thing",
        "",
        "Ultraworked with [Sisyphus](https://example.com/x)",
        "Co-authored-by: Sisyphus <agent@example.com>",
        "",
      ].join("\n"),
    );
    const rc = main([path]);
    expect(rc).toBe(0);
    expect(readFileSync(path, "utf8")).toBe("feat: thing\n");
  });

  it("returns 2 on missing or extra argv", () => {
    expect(main([])).toBe(2);
    expect(main(["a", "b"])).toBe(2);
  });

  it("returns 1 on unreadable file", () => {
    const missing = join(tmpDir, "does-not-exist");
    expect(main([missing])).toBe(1);
  });
});

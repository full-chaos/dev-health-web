#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWLIST_PATH = path.join(ROOT, "design-lint.allowlist.json");
const SOURCE_EXTENSIONS = new Set([".tsx", ".jsx"]);
const SKIP_PARTS = new Set([
  "node_modules",
  ".next",
  "out",
  "build",
  "coverage",
  "test-results",
  "playwright-report",
  "artifacts",
  "vendor",
]);
const SKIP_PATH_RE =
  /(?:^|\/)(?:tests?|__tests__|fixtures|mocks|__generated__|generated|graphql|api)(?:\/|\.|$)/u;

const RULES = [
  {
    name: "no-raw-id-in-jsx",
    patterns: [
      { re: /[0-9a-f]{8}-[0-9a-f]{4}-/iu, label: "UUID literal" },
      { re: /#[0-9a-f]{8,}/iu, label: "long hash literal" },
    ],
  },
  {
    name: "no-internal-leak",
    patterns: [
      { re: /\/api\//iu, label: "/api/" },
      { re: /api\/graphql/iu, label: "api/graphql" },
      { re: /CHAOS-\d+/u, label: "CHAOS ticket id" },
      { re: /\bDEPLOYS\b/u, label: "DEPLOYS" },
      { re: /\bLINKED_INCIDENT\b/u, label: "LINKED_INCIDENT" },
      { re: /\bV1 SPARKLINE\b/iu, label: "V1 SPARKLINE" },
      { re: /\bDebug Filters\b/u, label: "Debug Filters" },
      { re: /\b(?:DETECTOR|TELEMETRY)_[A-Z0-9_]+\b/u, label: "detector/telemetry token" },
      { re: /\b(?:detector|telemetry)[A-Z][A-Za-z0-9_]*\b/u, label: "detector/telemetry token" },
    ],
  },
  {
    name: "cta-from-registry",
    patterns: [
      { re: /\bRe-orient in Cockpit\b/u, label: "Re-orient in Cockpit" },
      { re: /\bBack to Metrics View\b/u, label: "Back to Metrics View" },
      { re: /\bOpen Landscapes\b/u, label: "Open Landscapes" },
      { re: /\bExplore Work\b/u, label: "Explore Work" },
      { re: /\bOpen Flame\b/u, label: "Open Flame" },
      { re: /(^|[>"'`\s{])Evidence([<"'`\s}]|$)/u, label: "Evidence" },
    ],
  },
  {
    name: "chart-values-formatted",
    patterns: [{ re: /\b74\.74071428571429\b/u, label: "unformatted coverage value" }],
  },
];

function readAllowlist() {
  try {
    return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8"));
  } catch {
    return {};
  }
}

function posixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function rel(filePath) {
  return posixPath(path.relative(ROOT, filePath));
}

function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

function isAllowlisted(allowlist, rule, filePath, line) {
  const relative = rel(filePath);
  return (allowlist[rule] ?? []).some((entry) => {
    if (!entry?.file || !entry?.reason) return false;
    if (entry.line && entry.line !== line) return false;
    return globToRegExp(entry.file).test(relative);
  });
}

function hasSuppression(lines, index, rule) {
  if (index === 0) return false;
  const previous = lines[index - 1] ?? "";
  const re = new RegExp(
    `design-lint-disable-next-line\\s+(?:${rule}|design-lint/${rule})\\s+--\\s+\\S`,
    "u",
  );
  return re.test(previous);
}

function isCommentOnly(line, blockState) {
  const trimmed = line.trim();
  if (blockState.inBlock) {
    if (trimmed.includes("*/")) blockState.inBlock = false;
    return true;
  }
  if (trimmed.startsWith("/*")) {
    if (!trimmed.includes("*/")) blockState.inBlock = true;
    return true;
  }
  return trimmed.startsWith("//") || trimmed.startsWith("*");
}

function isLikelyUiLine(line) {
  return /<\w|>|label\s*:|title\s*:|aria-label|name\s*:|children\s*:/u.test(line);
}

function shouldSkipFile(filePath) {
  const relative = rel(filePath);
  if (relative === "src/lib/design/cta.ts") return true;
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(relative)) return true;
  if (relative.startsWith("eslint-plugin-design-lint/") || relative === "scripts/design-lint.mjs")
    return true;
  if (SKIP_PATH_RE.test(relative)) return true;
  return relative.split("/").some((part) => SKIP_PARTS.has(part));
}

function collectFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_PARTS.has(entry.name)) collectFiles(fullPath, files);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !shouldSkipFile(fullPath))
      files.push(fullPath);
  }
  return files;
}

const allowlist = readAllowlist();
const findings = [];
const roots = [path.join(ROOT, "src")];

for (const file of roots.flatMap((root) => collectFiles(root))) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/u);
  const blockState = { inBlock: false };
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (isCommentOnly(line, blockState) || !isLikelyUiLine(line)) return;
    for (const rule of RULES) {
      if (
        hasSuppression(lines, index, rule.name) ||
        isAllowlisted(allowlist, rule.name, file, lineNumber)
      )
        continue;
      const match = rule.patterns.find(({ re }) => re.test(line));
      if (match) {
        findings.push({ file: rel(file), line: lineNumber, rule: rule.name, label: match.label });
      }
    }
  });
}

const counts = Object.fromEntries(RULES.map((rule) => [rule.name, 0]));
for (const finding of findings) counts[finding.rule] += 1;

for (const finding of findings) {
  console.log(`${finding.file}:${finding.line} design-lint/${finding.rule} ${finding.label}`);
}

console.log("\nDesign lint static scan summary:");
for (const [rule, count] of Object.entries(counts)) {
  console.log(`  ${rule}: ${count}`);
}

if (findings.length > 0) process.exitCode = 1;

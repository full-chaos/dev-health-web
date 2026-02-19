#!/usr/bin/env node

import fs from "node:fs";
import { execSync } from "node:child_process";

const baseRef = process.env.GOVERNANCE_DIFF_BASE
  || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "HEAD~1");
const diffRange = `${baseRef}...HEAD`;

function run(command) {
  return execSync(command, { encoding: "utf8" });
}

function getChangedFiles() {
  try {
    const output = run(`git diff --name-only "${diffRange}"`);
    return output.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch (error) {
    console.error(`Unable to compute changed files for range "${diffRange}".`);
    console.error("Ensure the PR base ref is fetched before running this check.");
    console.error(error.message);
    process.exit(1);
  }
}

function isTestFile(path) {
  if (path.startsWith("tests/")) return true;
  if (path.includes("/__tests__/")) return true;
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(path);
}

function readPullRequestBody() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) return "";

  try {
    const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    return event.pull_request?.body || "";
  } catch {
    return "";
  }
}

function getWaiverReason(prBody) {
  const match = prBody.match(/^TEST-WAIVER:\s*(\S.+)\s*$/im);
  return match ? match[1].trim() : "";
}

const changedFiles = getChangedFiles();
const srcFiles = changedFiles.filter((path) => path.startsWith("src/"));

if (srcFiles.length === 0) {
  console.log("No src/ changes detected. Governance check passed.");
  process.exit(0);
}

const touchedTestFiles = changedFiles.filter(isTestFile);
if (touchedTestFiles.length > 0) {
  console.log(
    `src/ changes detected with ${touchedTestFiles.length} related test file change(s). Governance check passed.`,
  );
  process.exit(0);
}

const prBody = readPullRequestBody();
const waiverReason = getWaiverReason(prBody);
if (waiverReason) {
  console.log("src/ changes detected without test file edits, but explicit TEST-WAIVER was provided.");
  console.log(`Waiver reason: ${waiverReason}`);
  process.exit(0);
}

console.error("Governance check failed.");
console.error("This PR changes src/ files but does not touch tests and has no explicit waiver.");
console.error("Add at least one test change, or include this exact line in the PR body:");
console.error("TEST-WAIVER: <reason tests were not touched>");
process.exit(1);

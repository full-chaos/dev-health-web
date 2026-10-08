#!/usr/bin/env node
// CHAOS-8789: split lint and Rolldown-parse diagnostics into changed-path
// findings and unchanged-path baseline, written to the job summary.
// Diagnostic only: it adds no gate. The only non-zero exit is a lint ERROR on a
// changed path, which `pnpm lint` already fails on.
//
//   ci-baseline-diagnostics.mjs lint            runs eslint over src
//   ci-baseline-diagnostics.mjs parse <logfile> reads a captured test/build log
//
// Env: BASE_SHA = commit to diff against (PR base / merge-group base / push
// "before"). Missing or unresolvable => no path counts as changed, and the
// summary says so.
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const [mode, logFile] = process.argv.slice(2);

function changedFiles() {
    const base = (process.env.BASE_SHA ?? "").trim();
    if (!base || /^0+$/.test(base))
        return { set: new Set(), note: "BASE_SHA not set; no path counted as changed" };
    try {
        try {
            execFileSync("git", ["cat-file", "-e", `${base}^{commit}`], { stdio: "ignore" });
        } catch {
            execFileSync("git", ["fetch", "--no-tags", "--depth=1", "origin", base], {
                stdio: "ignore",
            });
        }
        const out = execFileSync("git", ["diff", "--name-only", base, "HEAD"], {
            encoding: "utf8",
        });
        return {
            set: new Set(out.split("\n").filter(Boolean)),
            note: `changed set = git diff --name-only ${base.slice(0, 12)} HEAD`,
        };
    } catch (e) {
        return {
            set: new Set(),
            note: `could not diff against ${base.slice(0, 12)} (${e.message.split("\n")[0]}); no path counted as changed`,
        };
    }
}

function emit(lines) {
    const text = lines.join("\n") + "\n";
    process.stdout.write(text);
    if (process.env.GITHUB_STEP_SUMMARY)
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
}

function render(title, note, changed, baseline) {
    const fmt = (xs) => (xs.length ? xs.map((x) => `- ${x}`) : ["- none"]);
    return [
        `### ${title}`,
        `_${note}_`,
        "",
        `**Changed-path findings (${changed.length})**`,
        ...fmt(changed),
        "",
        `**Baseline, unchanged-path (${baseline.length})**`,
        ...fmt(baseline),
    ];
}

const { set: changed, note } = changedFiles();
const rel = (p) => path.relative(root, p).split(path.sep).join("/");

if (mode === "lint") {
    const r = spawnSync("node_modules/.bin/eslint", ["src", "-f", "json"], {
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
    });
    let results;
    try {
        results = JSON.parse(r.stdout);
    } catch {
        console.error(`eslint produced no JSON (exit ${r.status}):\n${r.stderr}`);
        process.exit(1);
    }
    const changedLines = [];
    const baselineLines = [];
    let changedErrors = 0;
    for (const f of results) {
        const file = rel(f.filePath);
        for (const m of f.messages) {
            const sev = m.severity === 2 ? "error" : "warning";
            const line = `${sev} \`${file}:${m.line}\` ${m.ruleId ?? "(parse)"}: ${m.message}`;
            if (changed.has(file)) {
                changedLines.push(line);
                if (sev === "error") changedErrors++;
            } else {
                baselineLines.push(line);
            }
        }
    }
    emit(render("Lint diagnostics", note, changedLines, baselineLines));
    if (changedErrors > 0) {
        console.error(`::error::${changedErrors} lint error(s) on changed paths`);
        process.exit(1);
    }
} else if (mode === "parse" && logFile) {
    const log = readFileSync(logFile, "utf8");
    const files = new Set();
    for (const m of log.matchAll(
        /^Failed to parse file:\/\/(\S+?)\. Excluding it from coverage\.$/gm,
    )) {
        files.add(rel(decodeURIComponent(m[1])));
    }
    const changedLines = [];
    const baselineLines = [];
    for (const f of [...files].sort())
        (changed.has(f) ? changedLines : baselineLines).push(
            `\`${f}\` Rolldown parse failure, excluded from coverage`,
        );
    emit(render("Rolldown parse diagnostics", note, changedLines, baselineLines));
} else {
    console.error("usage: ci-baseline-diagnostics.mjs lint | parse <logfile>");
    process.exit(2);
}

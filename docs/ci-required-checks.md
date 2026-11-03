# Required status checks

Updated GitHub ruleset on 2026-04-16 to require `enforce-src-test-policy`, `Analyze (actions)`, `Analyze (javascript-typescript)`, `Build Static Assets`, and `test`.
Rule: https://github.com/full-chaos/dev-health-web/rules/11469284

PR titles follow `<type>(<area>): CHAOS-<n> <description>` with exactly one id. The check `pr-title` (`.github/workflows/pr-title.yml`) enforces it; the one pattern lives in `.github/scripts/check-pr-title.sh`. It becomes a required check by a ruleset change by the repo owner. Dependabot PRs are exempt by author.

# Design lint

`pnpm design-lint` runs the local `eslint-plugin-design-lint` AST rules and `scripts/design-lint.mjs` static string scan. `pnpm lint`, Lefthook pre-commit/pre-push, and CI all run the same gate.

- `no-raw-id-in-jsx`: flags UUIDs and long `#hash` ids in JSX text and label-bearing props; use `resolveEntityLabel`/EntityLabel and pass `unresolvedFallback: "Unresolved"` when the display name is intentionally unavailable.
- `no-hardcoded-style`: flags hex colors and `px` values in `className`, `style`, and styled template literals; use the tokens in `docs/design-system.md` and `src/app/globals.css`.
- `cta-from-registry`: flags inline button/link CTA labels, including the known forbidden strings; import labels from `src/lib/design/cta.ts`.
- `no-internal-leak`: flags user-facing `/api/`, `api/graphql`, `CHAOS-*`, `DEPLOYS`, `LINKED_INCIDENT`, `V1 SPARKLINE`, `Debug Filters`, and detector/telemetry token strings.
- `chart-values-formatted`: flags raw numeric chart label/tick/tooltip/datalabel conversions; use `formatNumber` or `formatPercent`.

Suppress a single intentional violation with `// design-lint-disable-next-line <rule> -- reason` immediately above the flagged line. For shared exceptions, add an entry to `design-lint.allowlist.json` with `file`, optional `line`, and `reason`; broad allowlist entries must stay rare and documented.

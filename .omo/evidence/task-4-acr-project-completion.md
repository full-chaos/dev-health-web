# Task 4 ACR Contract Boundary Evidence

## Source and Artifact Boundary

- Pinned ACR source commit: `11c44ef812f9f9ae71a044d64f00ebae1ea1602f`.
- Source input is read only from an explicit `ACR_ROOT` or `--source` path, requires that exact clean Git checkout, and is copied in lexical path order.
- Normal `node scripts/sync-acr-contracts.mjs check` reads only committed web artifacts; it has no sibling checkout dependency.
- The committed manifest is sorted, contains only paths and SHA-256 digests, and contains no timestamp.

## Manual CLI QA

| Surface | Command | Observation |
| --- | --- | --- |
| Explicit generation | `ACR_ROOT=... node scripts/sync-acr-contracts.mjs generate` | Exit 0. |
| Determinism | Run explicit generation twice and compare SHA-256 values for `generated.ts`, `contracts.ts`, and `manifest.json` | Identical values. |
| Source-aware drift check | `ACR_ROOT=... node scripts/sync-acr-contracts.mjs check` | Exit 0; `ACR contracts are current.` |
| Committed-artifact check | `node scripts/sync-acr-contracts.mjs check` | Exit 0 without an ACR sibling source. |
| Mutated fixture | Focused CLI test appends to a committed example, invokes `check`, then restores it | Check exits 1 with digest drift and does not rewrite artifacts. |
| Malformed schema | Focused CLI test updates a schema digest for malformed JSON, invokes `check`, then restores both files | Check exits 1 and does not rewrite artifacts. |

## Automated Verification

- `pnpm exec vitest run src/lib/acr/__tests__/contracts.test.ts scripts/__tests__/sync-acr-contracts.test.mjs`: 8 passed.
- `pnpm exec eslint src/lib/acr`: exit 0.
- `pnpm typecheck`: exit 0.
- `pnpm exec prettier --check` on the task files: exit 0.
- `pnpm design-lint`: repository baseline fails outside this task's scope (266 existing errors after the ACR generated-module lint cleanup); the design-lint static scan reports zero findings. No rendered UI changed.

## Adversarial Notes

- A missing or dirty explicit ACR source is rejected before any write.
- Schema parsing, digest validation, source-commit mismatch, and missing committed artifacts fail closed.
- The CLI invokes Node modules directly; it does not invoke `pnpm`, avoiding package-manager hangs during generation and check.
- Re-running generation is interruption-safe because every artifact is derived deterministically from the pinned source commit.

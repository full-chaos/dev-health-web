# Task 4 ACR Contract Boundary Evidence

## Source and Artifact Boundary

- Pinned ACR source commit: `11c44ef812f9f9ae71a044d64f00ebae1ea1602f`.
- Generation source input is read only from an explicit `ACR_ROOT` or `--source` path and requires that exact clean Git checkout. The primary copy order is OpenAPI; capabilities, packet, packet-item, request, error, evidence-ref, and expanded-evidence schemas; then packet and expanded-evidence goldens.
- Normal `node scripts/sync-acr-contracts.mjs check` reads only committed web artifacts; it has no sibling checkout dependency.
- The committed manifest contains only paths and SHA-256 digests, no timestamp, and preserves primary input order.
- The only deterministic closure follows that order: `agent_episode.v1.schema.json` and `agent_episode_create.v1.schema.json`, because copied OpenAPI references them. `context_packet_item` and `evidence_ref` are primary local `$ref` dependencies. During copying, OpenAPI external schema references are rebased to the committed `schemas/` directory and unit-tested for local resolution. No unrelated REST or MCP artifact is copied.

## Remediation

- `DESIGN.md` now names the literal `/agent-context/context-packet` route, Diagnose placement, request form, all five category groups, packet diagnostics, sanitized evidence, all controlled states, responsive breakpoints, keyboard/focus behavior, and accepted debt. Todo 6 must implement this contract rather than redefine it.
- Source-dependent tests use `process.env.ACR_ROOT` and skip only when it is absent or does not identify an ACR checkout. Committed-artifact and mutation/malformed tests always run.
- `tests/fixtures/acr-contracts-mutated` adds a forbidden `token` request-schema property, changing its digest. The negative check exits 1 and leaves committed artifacts unchanged.

## Manual CLI QA

| Surface | Command | Observation |
| --- | --- | --- |
| Explicit generation | `pnpm acr:contracts:generate --source "$ACR_ROOT"` | Exit 0. |
| Determinism | Run explicit generation twice and byte-compare `src/lib/acr` | Identical bytes. |
| Source-aware drift check | `pnpm acr:contracts:check --source "$ACR_ROOT"` | Exit 0; `ACR contracts are current.` |
| Committed-artifact check | `node scripts/sync-acr-contracts.mjs check` | Exit 0 without an ACR sibling source. |
| Exact mutated source fixture | `pnpm acr:contracts:check --source tests/fixtures/acr-contracts-mutated` | Exit 1 with `artifact drift: schemas/context_packet_request.v1.schema.json` and leaves committed artifacts byte-identical. |
| Mutated fixture | Focused CLI test appends to a committed example, invokes `check`, then restores it | Check exits 1 with digest drift and does not rewrite artifacts. |
| Malformed schema | Focused CLI test updates a schema digest for malformed JSON, invokes `check`, then restores both files | Check exits 1 and does not rewrite artifacts. |

## Automated Verification

- `ACR_ROOT="$ACR_ROOT" pnpm test:unit -- src/lib/acr scripts/__tests__/sync-acr-contracts.test.mjs`: 328 files / 2,967 tests passed.
- `pnpm typecheck`: exit 0.
- `pnpm exec prettier --check` on the task files: exit 0.
- `node scripts/design-lint.mjs`: zero task-file static-scan findings.
- `pnpm design-lint`: baseline comparison remains 266 out-of-scope errors and one warning; the design-lint static scan reports zero findings. No rendered UI changed or baseline issue weakened.

## Adversarial Notes

- A missing or dirty explicit ACR source is rejected before any write.
- Schema parsing, digest validation, source-commit mismatch, and missing committed artifacts fail closed.
- A non-Git explicit source is accepted only for `check` as a tracked fixture overlay; it cannot generate or overwrite committed artifacts.
- The CLI invokes Node modules directly; it does not invoke `pnpm`, avoiding package-manager hangs during generation and check.
- Generation is deterministic from the pinned source commit; rerun it after any interrupted generation before committing artifacts.

# Formatting enforcement and 4-space rollout

The repository Prettier policy is 4-space indentation with tabs disabled:

```json
{
    "tabWidth": 4,
    "useTabs": false
}
```

## Enforcement

- Local hooks are managed by Lefthook. If a checkout has `core.hooksPath=/dev/null`, Git silently skips every Lefthook hook even though `lefthook.yml` is present.
- Re-enable hooks in affected checkouts with either:

```bash
git config --unset core.hooksPath
pnpm exec lefthook install --force
```

- CI now runs the blocking `Format` job through `bash ci/run_tests.sh format`, which checks changed Prettier-managed files with `pnpm exec prettier --check`.

## Bulk reformat rollout

Do not mix the repository-wide reformat with config or CI changes. The safe sequence is:

1. Land the Prettier config and CI enforcement change.
2. Let currently-open remediation PRs merge or be rebased.
3. Open one dedicated bulk-format branch and commit only `pnpm exec prettier --write .` output.
4. After the bulk-format commit lands, switch CI from changed-file format checking to full-repository `pnpm exec prettier --check .`.

That sequence keeps the enforcement change reviewable and avoids forcing every open PR to resolve a large formatting conflict at once.

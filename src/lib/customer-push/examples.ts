/**
 * Pure content builder for the runner-setup examples screen (Screen 4).
 * Snippets are reused verbatim from docs/customer-push-ingestion-setup-design.md
 * so the in-product tabs stay byte-identical to CHAOS-2713's eventual docs.
 *
 * The `dev-hops push` CLI (CHAOS-2700) does not exist yet as of this writing
 * (its flags here are illustrative, matching the design doc). Re-verify the
 * literal flag names against CHAOS-2700's implementation before treating
 * these as ground truth for customer-facing docs.
 */

import type { CustomerPushSystem } from "@/lib/admin/types";

export interface ExampleTab {
    id: string;
    label: string;
    language: "yaml" | "bash";
    code: string;
    badge?: "Experimental";
}

export interface BuildExampleSnippetsArgs {
    apiUrl?: string;
    sourceSystem: CustomerPushSystem;
    sourceInstance: string;
    tokenPlaceholder?: string;
}

/** `dev-hops push export` flag used to scope the export to one instance, per source system. */
function exportInstanceFlag(sourceSystem: CustomerPushSystem): string {
    switch (sourceSystem) {
        case "github":
            return '--repo "$GITHUB_REPOSITORY"';
        case "gitlab":
            return '--project "$CI_PROJECT_PATH"';
        default:
            return `--instance "${sourceSystem}"`;
    }
}

export function buildExampleSnippets({
    apiUrl = "$FULLCHAOS_API_URL",
    sourceSystem,
    sourceInstance,
    tokenPlaceholder = "$FULLCHAOS_INGEST_TOKEN",
}: BuildExampleSnippetsArgs): ExampleTab[] {
    const instanceComment = `# Source: ${sourceSystem} — ${sourceInstance}`;

    const githubActions: ExampleTab = {
        id: "github-actions",
        label: "GitHub Actions",
        language: "yaml",
        code: `${instanceComment}
name: Push Dev Health Data
on:
  schedule:
    - cron: "*/30 * * * *"
  workflow_dispatch:

jobs:
  push-dev-health:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Generate payload
        run: dev-hops push export ${sourceSystem} ${exportInstanceFlag(sourceSystem)} --since "$SINCE" --until "$UNTIL" > payload.json
      - name: Validate payload
        run: dev-hops push validate payload.json --schema external-ingest.v1
      - name: Push payload
        run: dev-hops push batch payload.json --api-url "$FULLCHAOS_API_URL" --token "$FULLCHAOS_INGEST_TOKEN" --org "$FULLCHAOS_ORG_ID" --poll
        env:
          FULLCHAOS_API_URL: ${apiUrl}
          FULLCHAOS_ORG_ID: \${{ vars.FULLCHAOS_ORG_ID }}
          FULLCHAOS_INGEST_TOKEN: \${{ secrets.FULLCHAOS_INGEST_TOKEN }}`,
    };

    const gitlabRunner: ExampleTab = {
        id: "gitlab-runner",
        label: "GitLab Runner",
        language: "yaml",
        code: `${instanceComment}
push_dev_health:
  image: ghcr.io/full-chaos/dev-hops:latest
  script:
    - dev-hops push export ${sourceSystem} ${exportInstanceFlag(sourceSystem)} --since "$SINCE" --until "$UNTIL" > payload.json
    - dev-hops push validate payload.json --schema external-ingest.v1
    - dev-hops push batch payload.json --api-url "$FULLCHAOS_API_URL" --token "$FULLCHAOS_INGEST_TOKEN" --org "$FULLCHAOS_ORG_ID" --poll
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"`,
    };

    const docker: ExampleTab = {
        id: "docker",
        label: "Generic Docker",
        language: "bash",
        code: `${instanceComment}
docker run --rm \\
  -e FULLCHAOS_API_URL="${apiUrl}" \\
  -e FULLCHAOS_ORG_ID="$FULLCHAOS_ORG_ID" \\
  -e FULLCHAOS_INGEST_TOKEN="${tokenPlaceholder}" \\
  ghcr.io/full-chaos/dev-hops:latest \\
  push export ${sourceSystem} ${exportInstanceFlag(sourceSystem)} --since "$SINCE" --until "$UNTIL" \\
  | dev-hops push batch - --api-url "$FULLCHAOS_API_URL" --token "$FULLCHAOS_INGEST_TOKEN" --org "$FULLCHAOS_ORG_ID" --poll

# Cron/systemd-timer equivalent: run the same command on a schedule (e.g. every 30 minutes).`,
    };

    const curl: ExampleTab = {
        id: "curl",
        label: "cURL",
        language: "bash",
        code: `${instanceComment}
curl -sS -X POST "${apiUrl}/api/v1/external-ingest/batches" \\
  -H "Authorization: Bearer ${tokenPlaceholder}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \\
  --data-binary @payload.json`,
    };

    const webhookRelay: ExampleTab = {
        id: "webhook-relay",
        label: "Webhook relay",
        language: "bash",
        badge: "Experimental",
        code: `${instanceComment}
# Webhooks can reduce latency but do not replace scheduled reconciliation.
# Use a relay when you want provider webhooks to stay inside your environment.
#
# The relay listens for ${sourceSystem} webhook events, normalizes them into
# the external-ingest envelope, and forwards each batch the same way the
# cURL example does:
curl -sS -X POST "${apiUrl}/api/v1/external-ingest/batches" \\
  -H "Authorization: Bearer ${tokenPlaceholder}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \\
  --data-binary @relayed-payload.json

# Still run a scheduled reconciliation job (see the other tabs) — webhooks
# accelerate updates, they do not replace it.`,
    };

    return [githubActions, gitlabRunner, docker, curl, webhookRelay];
}

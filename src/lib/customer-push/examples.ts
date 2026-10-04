/**
 * Pure content builder for the runner-setup examples screen (Screen 4).
 * Snippets are reused verbatim from docs/customer-push-ingestion-setup-design.md
 * so the in-product tabs stay byte-identical to CHAOS-2713's eventual docs.
 *
 * The CLI is `dho push` (ops `internal/pushcli`): `validate`, `batch`, `status` and `sample` exist;
 * `dho push export` is only a stub that exits 1, so no snippet calls an export command: the
 * payload is the customer's own export in the external-ingest.v1 shape. The `dho` image
 * (ghcr.io/full-chaos/dev-health-go-dho) is distroless: its entrypoint is `dho` and it has no
 * shell, so it is used through `docker run`, never as a GitLab `script:` image.
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

/** The published operator image: its entrypoint is `dho`. */
export const DHO_IMAGE = "ghcr.io/full-chaos/dev-health-go-dho:latest";

/** Where the payload comes from: there is no export command yet. */
export const PAYLOAD_NOTE =
    "# payload.json: your own export in the external-ingest.v1 shape (no export command yet)";

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
      ${PAYLOAD_NOTE}
      - name: Validate payload
        run: docker run --rm -i ${DHO_IMAGE} push validate - < payload.json
      - name: Push payload
        run: docker run --rm -i -e FULLCHAOS_API_URL -e FULLCHAOS_ORG_ID -e FULLCHAOS_INGEST_TOKEN ${DHO_IMAGE} push batch - --poll < payload.json
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
${PAYLOAD_NOTE}
# The dho image has no shell, so a GitLab script job calls the API directly.
push_dev_health:
  image: curlimages/curl:latest
  script:
    - 'curl -sS -X POST "$FULLCHAOS_API_URL/api/v1/external-ingest/batches" -H "Authorization: Bearer $FULLCHAOS_INGEST_TOKEN" -H "Content-Type: application/json" -H "Idempotency-Key: $IDEMPOTENCY_KEY" --data-binary @payload.json'
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"`,
    };

    const docker: ExampleTab = {
        id: "docker",
        label: "Generic Docker",
        language: "bash",
        code: `${instanceComment}
${PAYLOAD_NOTE}
docker run --rm -i \\
  -e FULLCHAOS_API_URL="${apiUrl}" \\
  -e FULLCHAOS_ORG_ID="$FULLCHAOS_ORG_ID" \\
  -e FULLCHAOS_INGEST_TOKEN="${tokenPlaceholder}" \\
  ${DHO_IMAGE} \\
  push batch - --poll < payload.json

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

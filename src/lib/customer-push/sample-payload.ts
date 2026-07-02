import type { CustomerPushSystem } from "@/lib/admin/types";

/**
 * Minimal illustrative sample envelope for the Validate screen's "use sample
 * payload" mode. This is NOT the canonical fixture — CHAOS-2692/2701 own the
 * packaged example payloads
 * (dev_health_ops/api/external_ingest/examples/<kind>.json) that are the
 * source of truth. The samples ARE schema-valid against the real ops record
 * schemas (RepositoryV1 / WorkItemV1 — required fields only, extra="forbid"):
 * "Use sample" → "Validate payload" must succeed against the live proxy, and
 * the round-trip e2e pins that (adversarial-review finding — a sample the
 * real endpoint rejects passed the old mock silently).
 */
export function buildSamplePayload(system: CustomerPushSystem, instance: string): unknown {
    const now = new Date().toISOString();
    const gitFamily = system === "github" || system === "gitlab" || system === "custom";

    const records = gitFamily
        ? [
              {
                  kind: "repository.v1",
                  externalId: instance,
                  // RepositoryV1: externalId + sourceSystem required; the old
                  // name/updatedAt fields are extra="forbid" rejections.
                  payload: {
                      externalId: instance,
                      sourceSystem: system,
                  },
              },
          ]
        : [
              {
                  kind: "work_item.v1",
                  externalId: `${instance}-1`,
                  // WorkItemV1: externalKey/provider/title/status/createdAt
                  // required; status must be from the pinned literal set.
                  payload: {
                      externalKey: `${instance}-1`,
                      provider: system,
                      title: "Sample work item",
                      status: "todo",
                      createdAt: now,
                  },
              },
          ];

    return {
        schemaVersion: "external-ingest.v1",
        idempotencyKey: `sample-validate-${instance}-${now}`,
        source: {
            type: "customer_push",
            system,
            instance,
            producer: "validate-screen-sample",
            producerVersion: "0.0.0",
        },
        window: { startedAt: now, endedAt: now },
        records,
    };
}

import type { CustomerPushSystem } from "@/lib/admin/types";

/**
 * Minimal illustrative sample envelope for the Validate screen's "use sample
 * payload" mode. This is NOT the canonical fixture — CHAOS-2692/2701 own the
 * packaged example payloads
 * (dev_health_ops/api/external_ingest/examples/<kind>.json) that are the
 * source of truth. This exists so a customer can see one submittable shape
 * before writing their own exporter; it may still fail deep validation
 * against the real record schema, which is fine — the Validate screen
 * renders both outcomes.
 */
export function buildSamplePayload(system: CustomerPushSystem, instance: string): unknown {
    const now = new Date().toISOString();
    const gitFamily = system === "github" || system === "gitlab" || system === "custom";

    const records = gitFamily
        ? [
              {
                  kind: "repository.v1",
                  externalId: instance,
                  payload: {
                      externalId: instance,
                      name: instance.split("/").pop() ?? instance,
                      updatedAt: now,
                  },
              },
          ]
        : [
              {
                  kind: "work_item.v1",
                  externalId: `${instance}-1`,
                  payload: {
                      externalKey: `${instance}-1`,
                      title: "Sample work item",
                      status: "open",
                      updatedAt: now,
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

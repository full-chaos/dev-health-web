import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildExampleSnippets, DHO_IMAGE, PAYLOAD_NOTE } from "../examples";

describe("buildExampleSnippets", () => {
    const base = { sourceSystem: "github" as const, sourceInstance: "meridian/api" };

    it("returns exactly 5 tabs in the documented order", () => {
        const tabs = buildExampleSnippets(base);
        expect(tabs.map((t) => t.id)).toEqual([
            "github-actions",
            "gitlab-runner",
            "docker",
            "curl",
            "webhook-relay",
        ]);
    });

    it("marks only the webhook relay tab as Experimental", () => {
        const tabs = buildExampleSnippets(base);
        expect(tabs.find((t) => t.id === "webhook-relay")?.badge).toBe("Experimental");
        expect(tabs.filter((t) => t.badge).length).toBe(1);
    });

    it("the cURL tab uses the real external-ingest data-plane path", () => {
        const tabs = buildExampleSnippets(base);
        const curl = tabs.find((t) => t.id === "curl");
        expect(curl?.code).toContain("/api/v1/external-ingest/batches");
    });

    // CHAOS-8585: the CLI is `dho` (ops internal/pushcli). `dho push export` is a stub that exits 1,
    // so no snippet calls it; the Python CLI and its image are removed.
    const codeOf = (system: "github" | "gitlab") =>
        buildExampleSnippets({ ...base, sourceSystem: system }).map((t) => t.code);

    it("no snippet names the removed Python CLI or its image", () => {
        for (const code of [...codeOf("github"), ...codeOf("gitlab")]) {
            expect(code).not.toContain("dev-hops");
        }
    });

    it("no snippet calls `push export` (no Go export command exists)", () => {
        for (const code of [...codeOf("github"), ...codeOf("gitlab")]) {
            expect(code).not.toMatch(/push export/u);
            expect(code).not.toMatch(/--since|--until/u);
        }
    });

    it("GitHub Actions validates then pushes through the dho image, payload from stdin", () => {
        const code = buildExampleSnippets(base).find((t) => t.id === "github-actions")?.code ?? "";
        expect(code).toContain(`docker run --rm -i ${DHO_IMAGE} push validate - < payload.json`);
        expect(code).toContain(`${DHO_IMAGE} push batch - --poll < payload.json`);
        expect(code).toContain(PAYLOAD_NOTE);
        expect(code.indexOf("push validate")).toBeLessThan(code.indexOf("push batch"));
    });

    it("the Generic Docker tab runs dho by its entrypoint: `push batch -` with the payload on stdin", () => {
        const code = buildExampleSnippets(base).find((t) => t.id === "docker")?.code ?? "";
        expect(code).toContain("docker run --rm -i");
        expect(code).toContain(`${DHO_IMAGE} \\\n  push batch - --poll < payload.json`);
        expect(code).toContain(PAYLOAD_NOTE);
    });

    it("the GitLab tab does not use the shell-less dho image as a script image", () => {
        const code = buildExampleSnippets(base).find((t) => t.id === "gitlab-runner")?.code ?? "";
        expect(code).not.toContain("dev-health-go-dho");
        expect(code).toContain("/api/v1/external-ingest/batches");
        // Every header is one the API reads (ops internal/api/externalingest: auth.go:240 Bearer,
        // handlers.go:242 Idempotency-Key, which must equal the body's idempotencyKey).
        expect(code).toContain('-H "Authorization: Bearer $FULLCHAOS_INGEST_TOKEN"');
        expect(code).toContain('-H "Content-Type: application/json"');
        expect(code).toContain('-H "Idempotency-Key: $IDEMPOTENCY_KEY"');
        expect(code).toContain("IDEMPOTENCY_KEY must equal the payload's idempotencyKey");
        expect(code).not.toContain("X-Org-Id");
        expect(code).toContain(PAYLOAD_NOTE);
    });

    it("the image is the published Go operator image", () => {
        expect(DHO_IMAGE).toBe("ghcr.io/full-chaos/dev-health-go-dho:latest");
    });

    it("the design doc carries the same dho lines (byte-equal with the snippets)", () => {
        const doc = readFileSync(
            path.join(process.cwd(), "docs/customer-push-ingestion-setup-design.md"),
            "utf8",
        );
        expect(doc).toContain(`${DHO_IMAGE} push validate - < payload.json`);
        expect(doc).toContain(`${DHO_IMAGE} push batch - --poll < payload.json`);
        expect(doc).toContain(PAYLOAD_NOTE);
        expect(doc).not.toContain("dev-hops");
    });

    it("substitutes a custom apiUrl when provided", () => {
        const tabs = buildExampleSnippets({ ...base, apiUrl: "https://api.example.com" });
        const curl = tabs.find((t) => t.id === "curl");
        expect(curl?.code).toContain("https://api.example.com/api/v1/external-ingest/batches");
    });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The plane fixture copy must stay a byte copy of the ingress contract at the commit named in
// ci/ops-contract.pin. The pinned sparse checkout (.github/workflows/tests.yml) brings the file in;
// WEB_REQUIRE_ACCESS_TOKEN_CORPUS=1 (the CI gate tier, ci/run_tests.sh access-token-corpus) turns a
// missing checkout into a failure; a bare local run skips loudly. Same pattern as
// src/lib/auth/authorize/__tests__/corpus.test.ts:9-13.
const contractRoot = process.env.WEB_OPS_CONTRACT_ROOT ?? "";
const required = process.env.WEB_REQUIRE_ACCESS_TOKEN_CORPUS === "1";
const suite = contractRoot !== "" || required ? describe : describe.skip;

const FIXTURE = join(__dirname, "fixtures/live-e2e-plane-router/planes.json.txt");

suite("plane fixture copy against the pinned ops contract", () => {
    it("the pinned contract checkout is named", () => {
        expect(contractRoot).not.toBe("");
    });

    it("planes.json.txt is a byte copy of contracts/ingress/v1/planes.json at the pin", () => {
        const pinned = readFileSync(join(contractRoot, "contracts/ingress/v1/planes.json"));
        const copy = readFileSync(FIXTURE);
        expect(
            copy.equals(pinned),
            `${FIXTURE} differs from the pinned ops file; refresh the copy from ci/ops-contract.pin`,
        ).toBe(true);
    });
});

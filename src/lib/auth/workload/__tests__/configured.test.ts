import { afterEach, describe, expect, it, vi } from "vitest";
import { ISSUER, load, setEnv, subjectFile } from "./harness";

afterEach(() => vi.unstubAllEnvs());

describe("workloadTokenConfigured", () => {
    it("is true with the three env values", async () => {
        setEnv(subjectFile());
        expect((await load()).workloadTokenConfigured()).toBe(true);
    });
    it.each(["AUTH_INTERNAL_URL", "AUTH_WORKLOAD_SUBJECT_FILE", "AUTH_WORKLOAD_ISSUER"])(
        "is false when %s is missing",
        async (name) => {
            setEnv(subjectFile());
            vi.stubEnv(name, "");
            expect((await load()).workloadTokenConfigured()).toBe(false);
        },
    );
    it("is false for an issuer that is not an https URL", async () => {
        setEnv(subjectFile());
        vi.stubEnv("AUTH_WORKLOAD_ISSUER", ISSUER.replace("https", "http"));
        expect((await load()).workloadTokenConfigured()).toBe(false);
    });
});

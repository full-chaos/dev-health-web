import { describe, expect, it } from "vitest";
import { mergePagerDutyAdminMappings, readPagerDutyAdminMappings } from "./pagerDutyMappingOptions";

describe("readPagerDutyAdminMappings", () => {
    it("retains every valid repository target while filtering blank and malformed entries", () => {
        // Given: persisted mappings with multiple valid targets and invalid configuration data.
        const options = {
            service_repository_mappings: {
                admin: {
                    "service-api": [
                        { provider: "github", full_name: "full-chaos/api" },
                        { provider: "gitlab", full_name: "full-chaos/api-mirror" },
                        { provider: "", full_name: "full-chaos/ignored" },
                        { provider: "github", full_name: " " },
                        "not-a-repository",
                    ],
                    " ": [{ provider: "github", full_name: "full-chaos/ignored" }],
                    "service-empty": [{ provider: "github", full_name: "" }],
                },
            },
        };

        // When: the mapping editor reads its web-owned namespace.
        const mappings = readPagerDutyAdminMappings(options);

        // Then: every usable target remains, with no invented or blank mapping.
        expect(mappings).toEqual({
            "service-api": [
                { provider: "github", full_name: "full-chaos/api" },
                { provider: "gitlab", full_name: "full-chaos/api-mirror" },
            ],
        });
    });
});

describe("mergePagerDutyAdminMappings", () => {
    it("updates only admin and preserves Compass, heuristic, and unrelated namespaces", () => {
        // Given: mappings independently owned by the Compass and heuristic sources.
        const options = {
            owner: "full-chaos",
            service_repository_mappings: {
                admin: {
                    "service-old": [{ provider: "github", full_name: "full-chaos/old" }],
                },
                compass: {
                    "service-catalog": [{ provider: "github", full_name: "full-chaos/catalog" }],
                },
                heuristic: {
                    "service-heuristic": [
                        { provider: "gitlab", full_name: "full-chaos/heuristic" },
                    ],
                },
                integration_owned: { version: 1 },
            },
        };

        // When: a PagerDuty administrator saves the complete current mapping set.
        const merged = mergePagerDutyAdminMappings(options, {
            "service-api": [
                { provider: "github", full_name: "full-chaos/api" },
                { provider: "gitlab", full_name: "full-chaos/api-mirror" },
            ],
        });

        // Then: only admin changes and every independent namespace survives unchanged.
        expect(merged).toEqual({
            owner: "full-chaos",
            service_repository_mappings: {
                admin: {
                    "service-api": [
                        { provider: "github", full_name: "full-chaos/api" },
                        { provider: "gitlab", full_name: "full-chaos/api-mirror" },
                    ],
                },
                compass: {
                    "service-catalog": [{ provider: "github", full_name: "full-chaos/catalog" }],
                },
                heuristic: {
                    "service-heuristic": [
                        { provider: "gitlab", full_name: "full-chaos/heuristic" },
                    ],
                },
                integration_owned: { version: 1 },
            },
        });
    });

    it("clears only admin when the PagerDuty mapping editor no longer applies", () => {
        // Given: mappings from PagerDuty admin and non-web-owned sources.
        const options = {
            service_repository_mappings: {
                admin: {
                    "service-old": [{ provider: "github", full_name: "full-chaos/old" }],
                },
                compass: {
                    "service-catalog": [{ provider: "github", full_name: "full-chaos/catalog" }],
                },
                heuristic: {
                    "service-heuristic": [
                        { provider: "gitlab", full_name: "full-chaos/heuristic" },
                    ],
                },
            },
        };

        // When: an empty web-owned mapping set is merged after leaving PagerDuty services.
        const merged = mergePagerDutyAdminMappings(options, {});

        // Then: the root mapping configuration retains its independent namespaces.
        expect(merged).toEqual({
            service_repository_mappings: {
                compass: {
                    "service-catalog": [{ provider: "github", full_name: "full-chaos/catalog" }],
                },
                heuristic: {
                    "service-heuristic": [
                        { provider: "gitlab", full_name: "full-chaos/heuristic" },
                    ],
                },
            },
        });
    });
});

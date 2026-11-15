import type { Request, Response, Router } from "express";
import express from "express";

/** The mock answers of the go-api SSO provider routes (CHAOS-13638), one scenario at a time. */
export const SSO_SCENARIOS = [
    "providers",
    "empty",
    "plan-gate",
    "unavailable",
    "stub-500",
    "list-forbidden",
    "write-forbidden",
] as const;
export type SsoScenario = (typeof SSO_SCENARIOS)[number];

type Provider = Record<string, unknown> & { id: string; status: string };

const STAMP = "2026-11-01T00:00:00Z";
const seed = (): Provider[] => [
    {
        id: "00000000-0000-4000-8000-000000000a01",
        org_id: "00000000-0000-4000-8000-0000000000aa",
        name: "Okta (OIDC)",
        protocol: "oidc",
        status: "active",
        is_default: true,
        allow_idp_initiated: false,
        auto_provision_users: true,
        default_role: "member",
        config: {
            client_id: "0oa-example",
            client_secret: "********",
            issuer: "https://idp.example",
        },
        allowed_domains: ["example.test"],
        last_metadata_sync_at: null,
        last_login_at: "2026-11-10T09:30:00Z",
        last_error: null,
        last_error_at: null,
        created_at: STAMP,
        updated_at: STAMP,
    },
    {
        id: "00000000-0000-4000-8000-000000000a02",
        org_id: "00000000-0000-4000-8000-0000000000aa",
        name: "Corporate SAML",
        protocol: "saml",
        status: "inactive",
        is_default: false,
        allow_idp_initiated: true,
        auto_provision_users: true,
        default_role: "member",
        config: { entity_id: "https://idp.example/saml", sso_url: "https://idp.example/sso" },
        allowed_domains: null,
        last_metadata_sync_at: null,
        last_login_at: null,
        last_error: "Certificate expired",
        last_error_at: "2026-11-09T12:00:00Z",
        created_at: STAMP,
        updated_at: STAMP,
    },
];

let scenario: SsoScenario = "providers";
let rows: Provider[] = seed();

export function setSsoScenario(next: unknown): next is SsoScenario {
    if (typeof next !== "string" || !(SSO_SCENARIOS as readonly string[]).includes(next)) {
        return false;
    }
    scenario = next as SsoScenario;
    rows = scenario === "empty" ? [] : seed();
    return true;
}

function refused(req: Request, res: Response): boolean {
    const write = req.method !== "GET";
    switch (scenario) {
        case "plan-gate":
            res.status(402).json({
                detail: {
                    error: "feature_not_licensed",
                    feature: "sso_saml",
                    required_tier: "enterprise",
                    current_tier: "community",
                },
            });
            return true;
        case "unavailable":
            res.status(503).json({ detail: { message: "SSO provider service unavailable" } });
            return true;
        case "stub-500":
            res.status(500).type("application/json").send('{"detail":"Internal Server Error"}');
            return true;
        case "list-forbidden":
            res.status(403).json({ detail: "Admin access required" });
            return true;
        case "write-forbidden":
            if (write) {
                res.status(403).json({ detail: "Admin access required" });
                return true;
            }
            return false;
        default:
            return false;
    }
}

export function ssoProvidersRouter(): Router {
    const router = express.Router();
    router.use("/api/v1/auth/sso/providers", (req, res, next) => {
        if (!refused(req, res)) next();
    });
    router.get("/api/v1/auth/sso/providers", (_req, res) => {
        res.json({ items: rows, total: rows.length, limit: 50, offset: 0 });
    });
    router.post("/api/v1/auth/sso/providers", (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const created: Provider = {
            ...seed()[0],
            ...body,
            id: `00000000-0000-4000-8000-0000000000${String(10 + rows.length).padStart(2, "0")}`,
            status: "inactive",
            config: {
                ...((body.oidc_config ?? body.saml_config ?? {}) as object),
                client_secret: "********",
            },
        };
        rows = [...rows, created];
        res.status(201).json(created);
    });
    router.patch("/api/v1/auth/sso/providers/:id", (req, res) => {
        const index = rows.findIndex((row) => row.id === req.params.id);
        if (index < 0) {
            res.status(404).json({ detail: "SSO provider not found" });
            return;
        }
        const body = (req.body ?? {}) as Record<string, Record<string, unknown> | undefined>;
        // go-api takes a config block whole: the secret (OIDC) or certificate (SAML) is required inside it.
        const missing =
            body.oidc_config && !body.oidc_config.client_secret
                ? ["oidc_config", "client_secret"]
                : body.saml_config && !body.saml_config.certificate
                  ? ["saml_config", "certificate"]
                  : null;
        if (missing) {
            res.status(422).json({
                detail: [{ type: "missing", loc: ["body", ...missing], msg: "Field required" }],
            });
            return;
        }
        rows[index] = { ...rows[index], ...(req.body as object) };
        res.json(rows[index]);
    });
    router.delete("/api/v1/auth/sso/providers/:id", (req, res) => {
        rows = rows.filter((row) => row.id !== req.params.id);
        res.status(204).end();
    });
    for (const [verb, status] of [
        ["activate", "active"],
        ["deactivate", "inactive"],
    ] as const) {
        router.post(`/api/v1/auth/sso/providers/:id/${verb}`, (req, res) => {
            const index = rows.findIndex((row) => row.id === req.params.id);
            if (index < 0) {
                res.status(404).json({ detail: "SSO provider not found" });
                return;
            }
            rows[index] = { ...rows[index], status };
            res.json(rows[index]);
        });
    }
    return router;
}

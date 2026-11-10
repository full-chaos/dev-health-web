/**
 * Wrong-credential-class matrix: every credential class of the ops registry against every row of
 * contracts/auth/v1/endpoint-profiles.web.json, through the real proxy, the real route handlers and
 * the real server actions, with the real src/lib/auth.ts (Auth.js) deciding the session.
 *
 * A wrong class must get the answer its garbage twin gets (matrix.ts baselineOf). A protected
 * baseline must be a refusal that reaches no backend; a real Auth.js session cookie must pass the
 * proxy and the guard, so the matrix cannot pass on a dead auth path. Public rows: no class changes
 * the answer.
 *
 * Input: WEB_CREDENTIAL_CLASSES names the ops credential-classes.json. With none, the file fails.
 *
 * Mocks and stubs, each because it cannot run here:
 * - `server-only` (config alias): Next's build marker throws outside the react-server condition.
 * - `next/headers`: headers() and cookies() throw outside a Next request scope; they answer the
 *   driven request's head, the only request input auth() reads.
 * - global fetch: a recorder, as no backend runs. A fetch in a wrong-class or baseline cell fails
 *   it; an accept cell must reach it or change the answer.
 * - `@/lib/redis`: no Redis server runs. The fail-closed limiters would answer 429 before any guard,
 *   so the client counts every key once (never limited).
 * - env: AUTH_SECRET, AUTH_URL, BACKEND_URL, LOG_LEVEL; LINEAR_API_KEY + LINEAR_TEAM_ID and
 *   ACR_OAUTH_ISSUER, without which feedback (503) and Ask Dev authorize (404 client_off) answer
 *   before their guards.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { RequestCookies } from "next/dist/server/web/spec-extension/cookies";
import {
    COMPARED_HEADERS,
    FILLER,
    actionTarget,
    baselineOf,
    carrierFor,
    censusLine,
    loadClasses,
    loadRows,
    newMinter,
    type Carrier,
    type CredentialClass,
    type ProfileRow,
} from "./matrix";

const ROOT = path.resolve(__dirname, "../..");
const PROFILES = path.join(ROOT, "contracts/auth/v1/endpoint-profiles.web.json");
const ORIGIN = "http://localhost:3000";
const BACKEND = "http://backend.wrong-class.test";
const SECRET = "wrong-class-gate-secret";
const SESSION_COOKIE = "authjs.session-token";
const SERVICE = "dev-health-web";
const IMPERSONATION_STATUS = `${BACKEND}/api/v1/admin/impersonate/status`;
const SIGN_IN = `${ORIGIN}/auth/signin`;
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const { current } = vi.hoisted(() => ({ current: { headers: new Headers() } }));
vi.mock("next/headers", () => ({
    headers: async () => current.headers,
    cookies: async () => new RequestCookies(current.headers),
}));
vi.mock("@/lib/redis", () => ({
    getRedis: async () => ({ eval: async () => 1, ttl: async () => 0 }),
}));

vi.stubEnv("LOG_LEVEL", "fatal");
vi.stubEnv("AUTH_SECRET", SECRET);
vi.stubEnv("AUTH_URL", `${ORIGIN}/api/auth`);
vi.stubEnv("BACKEND_URL", BACKEND);
vi.stubEnv("LINEAR_API_KEY", "wrong-class-linear-key");
vi.stubEnv("LINEAR_TEAM_ID", "wrong-class-team");
vi.stubEnv("ACR_OAUTH_ISSUER", "https://acr.wrong-class.test");

interface Fetched {
    url: string;
    method: string;
}
const fetched: Fetched[] = [];
const recorder = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    fetched.push({
        url,
        method: init?.method ?? (input instanceof Request ? input.method : "GET"),
    });
    // The superuser session's jwt callback reads the impersonation status: "not impersonating".
    const status = url === IMPERSONATION_STATUS;
    return new Response(status ? '{"is_impersonating":false}' : "{}", {
        status: status ? 200 : 599,
        headers: { "content-type": "application/json" },
    });
});

const classesPath = process.env.WEB_CREDENTIAL_CLASSES ?? "";
if (!classesPath) {
    throw new Error(
        "FAIL: missing ops-owned contract input credential-classes.json (WEB_CREDENTIAL_CLASSES). " +
            "A measurement that did not happen must fail. CI passes the pinned sparse checkout " +
            "(.ops-contract/contracts/auth/v1/credential-classes.json).",
    );
}
const classesRaw = readFileSync(classesPath, "utf8");
const classes = loadClasses(classesRaw);
const rows = loadRows(readFileSync(PROFILES, "utf8"));
const mint = newMinter();
const drivenClasses = classes.flatMap((c) => {
    const carrier = carrierFor(c, mint);
    return carrier ? [{ c, carrier }] : [];
});
const notDrivenClasses = classes.filter((c) => carrierFor(c, mint) === null);

// Arguments that get a server action past its input checks to its guard; every other action takes none.
const ACTION_ARGS: Record<string, unknown[]> = {
    "server_action:src/lib/admin/server/credentials.ts#createCredential": [
        { provider: "github", name: "default", credentials: {} },
    ],
    "server_action:src/lib/admin/server/sync.ts#createSyncConfig": [
        { provider: "github", name: "wrong-class" },
    ],
    "server_action:src/lib/admin/server/sync.ts#batchCreateSyncConfigs": [
        { provider: "github", name: "wrong-class", repos: ["acme/web"] },
    ],
    "server_action:src/lib/admin/server/serviceAccounts.ts#createServiceAccount": [
        { name: "wrong-class-svc" },
    ],
    "server_action:src/lib/admin/server/orgs.ts#inviteOrgMember": [
        "org-1",
        "a@example.test",
        "member",
    ],
    "server_action:src/lib/admin/server/orgs.ts#inviteCurrentOrgMember": [
        "a@example.test",
        "member",
    ],
    "server_action:src/lib/admin/server/orgs.ts#addOrgMemberByEmail": [
        "org-1",
        "a@example.test",
        "member",
    ],
    "server_action:src/lib/admin/server/orgs.ts#changeOrgMemberRole": ["org-1", "user-2", "member"],
    "server_action:src/app/(app)/superadmin/billing/audit/actions.ts#getAuditEntry": [
        "00000000-0000-4000-8000-000000000001",
    ],
    "server_action:src/app/(app)/superadmin/billing/audit/actions.ts#resolveAuditMismatch": [
        "00000000-0000-4000-8000-000000000001",
        "resolved",
    ],
    "server_action:src/lib/billing/actions/refunds.ts#createRefund": [
        { invoiceId: "in_wrongclass" },
    ],
};

// Query and JSON body that get a route handler past its input checks to its guard.
const REST_INPUT: Record<string, { query?: string; body?: Record<string, unknown> }> = {
    "GET /api/agent-context/evidence/[evidenceRefId] [dev-health-web]": {
        query: "?repository=acme/web",
    },
    "POST /api/agent-context/context-packets [dev-health-web]": {
        body: { goal: "wrong class", repository: "acme/web" },
    },
    "POST /api/acr/device [dev-health-web]": {
        body: { user_code: "WXYZ-2345", action: "preview" },
    },
    "POST /api/acr/authorize [dev-health-web]": {
        body: { handle: "H".repeat(43), action: "preview" },
    },
    "POST /api/ask-dev/authorize [dev-health-web]": {
        body: { code_challenge: "C".repeat(43), state: "S".repeat(43) },
    },
    "GET /org/admin/integrations/github-app/callback [dev-health-web]": {
        query: "?installation_id=1&state=wrong-class",
    },
};

let sessionCookie = "";

beforeAll(async () => {
    vi.stubGlobal("fetch", recorder);
    const { encode } = await import("next-auth/jwt");
    const now = Date.now();
    const tenYears = 10 * 365 * 24 * 3600;
    // Far-future expiry and validation stamp: the jwt callback neither refreshes nor revalidates.
    const value = await encode({
        secret: SECRET,
        salt: SESSION_COOKIE,
        maxAge: tenYears,
        token: {
            sub: "user-1",
            id: "user-1",
            email: "a@example.test",
            org_id: "org-1",
            role: "admin",
            is_superuser: true,
            permissions: [],
            needs_onboarding: false,
            access_token: "ops-access-wrong-class",
            refresh_token: "ops-refresh-wrong-class",
            expires_at: now + tenYears * 1000,
            last_validated: now + tenYears * 1000,
        },
    });
    sessionCookie = `${SESSION_COOKIE}=${value}`;
});
afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

const ISO_TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

function mask(text: string, requestId: string | null): string {
    const masked = text.replace(ISO_TIME, "<time>");
    return requestId ? masked.split(requestId).join("<request-id>") : masked;
}

interface Answer {
    answer: string;
    status: number;
    location: string | null;
    success: boolean;
}
interface Cell extends Answer {
    backend: Fetched[];
}

function requestHead(carrier: Carrier | null, cookie: string): Headers {
    const head = new Headers({ host: "localhost:3000", origin: ORIGIN });
    if (carrier?.header) head.set(carrier.header, carrier.value);
    if (cookie) head.set("cookie", cookie);
    return head;
}

function routeParams(route: string): {
    pathName: string;
    params: Record<string, string | string[]>;
} {
    const params: Record<string, string | string[]> = {};
    const segments = route.split("/").map((segment) => {
        const catchAll = /^\[\.\.\.(\w+)\]$/.exec(segment);
        if (catchAll) {
            params[catchAll[1]] = ["session"];
            return "session";
        }
        const one = /^\[(\w+)\]$/.exec(segment);
        if (one) {
            params[one[1]] = "wrong-class-x";
            return "wrong-class-x";
        }
        return segment;
    });
    return { pathName: segments.join("/"), params };
}

function restRequest(row: ProfileRow, method: string, carrier: Carrier | null, cookie: string) {
    const input = REST_INPUT[row.id] ?? {};
    const { pathName, params } = routeParams(row.route ?? "");
    const head = requestHead(carrier, cookie);
    let body: string | undefined;
    if (method !== "GET" && (input.body || carrier?.bodyField)) {
        const fields = { ...(input.body ?? {}) };
        if (carrier?.bodyField) fields[carrier.bodyField] = carrier.value;
        body = JSON.stringify(fields);
        head.set("content-type", "application/json");
    }
    current.headers = head;
    const url = `${ORIGIN}${pathName}${input.query ?? ""}`;
    return { request: new NextRequest(url, { method, headers: head, body }), params };
}

async function responseAnswer(response: Response): Promise<Answer> {
    const requestId = response.headers.get("x-request-id");
    const compared = COMPARED_HEADERS.flatMap((name) => {
        const value = response.headers.get(name);
        return value === null ? [] : [`${name}: ${mask(value, requestId)}`];
    });
    const body = mask(await response.text(), requestId);
    return {
        answer: `${response.status} [${compared.join("; ")}] ${JSON.stringify(body)}`,
        status: response.status,
        location: response.headers.get("location"),
        success: response.status >= 200 && response.status < 300,
    };
}

function thrownAnswer(error: unknown): Answer {
    const e = error as { name?: string; message?: string; digest?: unknown; status?: unknown };
    const digest = e?.digest === undefined ? "" : ` digest=${String(e.digest)}`;
    const status = typeof e?.status === "number" ? ` status=${e.status}` : "";
    const text = `throw ${e?.name ?? typeof error}: ${e?.message ?? String(error)}${status}${digest}`;
    return { answer: mask(text, null), status: 0, location: null, success: false };
}

async function drive(run: () => Promise<Answer>): Promise<Cell> {
    fetched.length = 0;
    let answer: Answer;
    try {
        answer = await run();
    } catch (error) {
        answer = thrownAnswer(error);
    }
    return { ...answer, backend: fetched.filter((f) => f.url !== IMPERSONATION_STATUS) };
}

async function importSource(file: string): Promise<Record<string, unknown>> {
    return (await import(/* @vite-ignore */ path.join(ROOT, file))) as Record<string, unknown>;
}

async function proxyCell(row: ProfileRow, method: string, carrier: Carrier | null, cookie: string) {
    const { proxy } = await import("@/proxy");
    return drive(async () =>
        responseAnswer(await proxy(restRequest(row, method, carrier, cookie).request)),
    );
}

type Handler = (request: NextRequest, context: unknown) => Promise<Response>;

async function handlerCell(
    row: ProfileRow,
    method: string,
    carrier: Carrier | null,
    cookie: string,
) {
    const handler = (await importSource(row.source.file))[method] as Handler;
    return drive(async () => {
        const { request, params } = restRequest(row, method, carrier, cookie);
        return responseAnswer(await handler(request, { params: Promise.resolve(params) }));
    });
}

async function actionCell(row: ProfileRow, carrier: Carrier | null, cookie: string) {
    const { file, exportName } = actionTarget(row);
    const action = (await importSource(file))[exportName];
    if (typeof action !== "function") throw new Error(`${row.id}: the export is not a function`);
    // A body-field class rides in the action's argument: the request body of a server action.
    const args = carrier?.bodyField
        ? [{ [carrier.bodyField]: carrier.value }]
        : (ACTION_ARGS[row.id] ?? []);
    current.headers = requestHead(carrier, cookie);
    return drive(async () => {
        const value: unknown = await (action as (...a: unknown[]) => unknown)(...args);
        const result = value as { error?: unknown; ok?: unknown } | null;
        const refused =
            typeof result === "object" &&
            result !== null &&
            ("error" in result || result.ok === false);
        return {
            answer: mask(`return ${JSON.stringify(value)}`, null),
            status: 0,
            location: null,
            success: !refused,
        };
    });
}

function twinCarrier(carrier: Carrier): Carrier | null {
    const twin = baselineOf(carrier);
    return twin.classId === "baseline:none" ? null : twin;
}

function refusalProblems(cell: Cell, what: string): string[] {
    const out: string[] = [];
    if (cell.backend.length > 0)
        out.push(`${what}: reached the backend ${JSON.stringify(cell.backend)}`);
    if (cell.success) out.push(`${what}: not a refusal: ${cell.answer}`);
    return out;
}

function signInRedirect(cell: Cell): boolean {
    return cell.status === 303 && (cell.location?.startsWith(SIGN_IN) ?? false);
}

const census = {
    driven: new Set<string>(),
    wrongCells: 0,
    acceptCells: 0,
    acceptReachedBackend: new Set<string>(),
};

async function actionRow(row: ProfileRow): Promise<string[]> {
    const problems: string[] = [];
    const baselines = new Map<string, Cell>();
    for (const { c, carrier } of drivenClasses) {
        if (row.accepted_credential_classes.includes(c.class_id)) continue;
        const key = baselineOf(carrier).classId;
        if (!baselines.has(key))
            baselines.set(key, await actionCell(row, twinCarrier(carrier), ""));
        const base = baselines.get(key)!;
        const wrong = await actionCell(row, carrier, "");
        census.wrongCells++;
        if (wrong.answer !== base.answer) {
            problems.push(`class ${c.class_id}: ${wrong.answer} != ${key} ${base.answer}`);
        }
        if (wrong.backend.length > 0) {
            problems.push(
                `class ${c.class_id}: reached the backend ${JSON.stringify(wrong.backend)}`,
            );
        }
    }
    for (const [key, base] of baselines) {
        if (base.backend.length > 0) problems.push(`${key}: reached the backend`);
    }
    if (row.classification === "protected") {
        if (!baselines.has("baseline:none"))
            baselines.set("baseline:none", await actionCell(row, null, ""));
        for (const [key, base] of baselines) problems.push(...refusalProblems(base, key));
        const accept = await actionCell(row, null, sessionCookie);
        census.acceptCells++;
        if (accept.backend.length > 0) census.acceptReachedBackend.add(row.surface_kind);
        if (
            accept.backend.length === 0 &&
            accept.answer === baselines.get("baseline:none")!.answer
        ) {
            problems.push(`accept: a session got the refusal ${accept.answer}`);
        }
    }
    return problems;
}

async function restRow(row: ProfileRow): Promise<string[]> {
    const problems: string[] = [];
    const { isPublicPath } = await import("@/proxy");
    // /api/auth/* is public to the proxy: there the handler is the only gate.
    const gatedByProxy = !isPublicPath(routeParams(row.route ?? "").pathName);
    const exported = await importSource(row.source.file);
    const methods =
        row.method && HTTP_METHODS.includes(row.method)
            ? [row.method]
            : HTTP_METHODS.filter((m) => typeof exported[m] === "function");
    if (methods.length === 0) problems.push("no handler method");
    for (const method of methods) {
        const baselines = new Map<string, { proxy: Cell; handler: Cell }>();
        const baselineFor = async (key: string, carrier: Carrier | null) => {
            if (!baselines.has(key)) {
                baselines.set(key, {
                    proxy: await proxyCell(row, method, carrier, ""),
                    handler: await handlerCell(row, method, carrier, ""),
                });
            }
            return baselines.get(key)!;
        };
        for (const { c, carrier } of drivenClasses) {
            if (row.accepted_credential_classes.includes(c.class_id)) continue;
            const key = baselineOf(carrier).classId;
            const base = await baselineFor(key, twinCarrier(carrier));
            const proxy = await proxyCell(row, method, carrier, "");
            const handler = await handlerCell(row, method, carrier, "");
            census.wrongCells++;
            if (proxy.answer !== base.proxy.answer) {
                problems.push(
                    `${method} class ${c.class_id} proxy: ${proxy.answer} != ${key} ${base.proxy.answer}`,
                );
            }
            if (handler.answer !== base.handler.answer) {
                problems.push(
                    `${method} class ${c.class_id} handler: ${handler.answer} != ${key} ${base.handler.answer}`,
                );
            }
            for (const [what, cell] of [
                ["proxy", proxy],
                ["handler", handler],
            ] as const) {
                if (cell.backend.length > 0) {
                    problems.push(
                        `${method} class ${c.class_id} ${what}: reached the backend ${JSON.stringify(cell.backend)}`,
                    );
                }
            }
        }
        for (const [key, base] of baselines) {
            if (base.proxy.backend.length > 0 || base.handler.backend.length > 0) {
                problems.push(`${method} ${key}: reached the backend`);
            }
        }
        if (row.classification !== "protected") continue;
        const none = await baselineFor("baseline:none", null);
        for (const [key, base] of baselines) {
            if (gatedByProxy && !signInRedirect(base.proxy)) {
                problems.push(
                    `${method} ${key} proxy: not the sign-in redirect: ${base.proxy.answer}`,
                );
            }
            problems.push(...refusalProblems(base.handler, `${method} ${key} handler`));
        }
        const acceptProxy = await proxyCell(row, method, null, sessionCookie);
        const acceptHandler = await handlerCell(row, method, null, sessionCookie);
        census.acceptCells++;
        if (gatedByProxy && !signInRedirect(acceptProxy) && acceptHandler.backend.length > 0) {
            census.acceptReachedBackend.add(row.surface_kind);
        }
        if (gatedByProxy && (signInRedirect(acceptProxy) || acceptProxy.backend.length > 0)) {
            problems.push(`${method} accept proxy: ${acceptProxy.answer}`);
        }
        if (acceptHandler.backend.length === 0 && acceptHandler.answer === none.handler.answer) {
            problems.push(
                `${method} accept handler: a session got the refusal ${acceptHandler.answer}`,
            );
        }
    }
    return problems;
}

describe("the matrix axes", () => {
    it("has rows, driven classes, a reason for each class not driven, and live fixtures", () => {
        expect(rows.length).toBeGreaterThan(0);
        expect(drivenClasses.length).toBeGreaterThan(0);
        for (const c of notDrivenClasses) {
            const reason =
                c.markers_none_reason?.trim() ||
                (c.markers.length > 0
                    ? `only qualifiers: ${c.markers.map((m) => m.kind).join(",")}`
                    : "");
            expect(reason, `class ${c.class_id} is not driven and gives no reason`).not.toBe("");
        }
        for (const id of [...Object.keys(ACTION_ARGS), ...Object.keys(REST_INPUT)]) {
            expect(
                rows.some((r) => r.id === id),
                `fixture ${id} names no inventory row`,
            ).toBe(true);
        }
    });

    it("refuses a marker kind with no carrier rule and a class with no marker and no reason", () => {
        const doc = (cls: object) => JSON.stringify({ classes: [cls] });
        expect(() =>
            loadClasses(doc({ class_id: "c", markers: [{ kind: "cookie", name: "sid" }] })),
        ).toThrow(/no carrier rule/);
        expect(() => loadClasses(doc({ class_id: "c", markers: [] }))).toThrow(/no marker/);
        expect(() => loadClasses(JSON.stringify({ classes: [] }))).toThrow(/no credential class/);
    });

    it("presents each carrier kind like the ops CarrierFor", () => {
        const fake = (alg: string, typ: string) => `h.${alg}${typ}.s`;
        const cls = (markers: object[]) => ({ class_id: "c", markers }) as CredentialClass;
        expect(carrierFor(cls([{ kind: "credential_prefix", name: "p_" }]), fake)).toMatchObject({
            header: "Authorization",
            value: `Bearer p_${FILLER}`,
        });
        const bearer = cls([
            { kind: "authorization_scheme", name: "Bearer" },
            { kind: "jwt_header_alg", name: "EdDSA" },
            { kind: "jwt_header_typ", name: "at+jwt" },
        ]);
        expect(carrierFor(bearer, fake)).toMatchObject({ value: "Bearer h.EdDSAat+jwt.s" });
        expect(carrierFor(cls([{ kind: "dedicated_header", name: "X-K" }]), fake)).toMatchObject({
            header: "X-K",
            value: FILLER,
        });
        expect(carrierFor(cls([{ kind: "signature_header", name: "X-S" }]), fake)).toMatchObject({
            header: "X-S",
            value: `sha256=${FILLER}`,
        });
        const body = cls([{ kind: "body_field", name: "f", shape: "prefix:dhr1_" }]);
        expect(carrierFor(body, fake)).toMatchObject({ bodyField: "f", value: `dhr1_${FILLER}` });
        expect(carrierFor(cls([{ kind: "grant_type", name: "refresh_token" }]), fake)).toBeNull();
        const odd = cls([{ kind: "body_field", name: "f", shape: "odd" }]);
        expect(() => carrierFor(odd, fake)).toThrow(/no carrier rule/);
        const header = newMinter()("EdDSA", "at+jwt").split(".")[0];
        expect(JSON.parse(Buffer.from(header, "base64url").toString())).toMatchObject({
            alg: "EdDSA",
            typ: "at+jwt",
        });
    });
});

describe("every class against every web endpoint-profile row", () => {
    for (const row of rows) {
        it(row.id, async () => {
            const problems =
                row.surface_kind === "server_action" ? await actionRow(row) : await restRow(row);
            census.driven.add(row.id);
            expect(problems, problems.join("\n")).toEqual([]);
        });
    }
});

describe("census", () => {
    it("drove every inventory row", () => {
        const inventory = (
            JSON.parse(readFileSync(PROFILES, "utf8")) as { rows: { id: string }[] }
        ).rows.map((r) => r.id);
        const registry = (JSON.parse(classesRaw) as { classes: unknown[] }).classes.length;
        process.stdout.write(
            `${censusLine({
                service: SERVICE,
                rows: inventory.length,
                classes: registry,
                driven: census.driven.size,
                wrongCells: census.wrongCells,
                acceptCells: census.acceptCells,
                notDriven: notDrivenClasses.map((c) => c.class_id),
            })}\n`,
        );
        expect(rows.length, "rows loaded vs inventory").toBe(inventory.length);
        expect(classes.length, "classes loaded vs registry").toBe(registry);
        expect(
            inventory.filter((id) => !census.driven.has(id)),
            "rows not driven",
        ).toEqual([]);
        expect(census.wrongCells).toBeGreaterThan(0);
        expect(census.acceptCells).toBeGreaterThan(0);
        const kinds = [...new Set(rows.map((r) => r.surface_kind))].sort();
        expect(
            [...census.acceptReachedBackend].sort(),
            "a session passes the proxy and the guard into the backend, per surface kind",
        ).toEqual(kinds);
    });
});

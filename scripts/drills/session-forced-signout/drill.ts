// Drill helper for web session recovery and forced sign-out (CHAOS-11234). Run with:
//   node_modules/.bin/tsx scripts/drills/session-forced-signout/drill.ts <verb> ...
// It talks HTTP to a running web server (WEB_URL) and, for the admin verb, to go-api (API_URL). A
// cookie jar is a 0600 JSON file. It prints names, status codes and 0/1 only: never a cookie, a
// token, a password or an email.
import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

type Jar = Record<string, string>;
type Credentials = { email: string; password: string };

function usage(): never {
    process.stderr.write(
        "verbs: login <creds.json> <jar> | read <jar> | copy <jar> <jar> | deactivate <admin-creds.json> <user-id>\n",
    );
    process.exit(2);
}

function env(name: string): string {
    const value = process.env[name];
    if (!value) {
        process.stderr.write(`set ${name}\n`);
        process.exit(2);
    }
    return value.replace(/\/+$/, "");
}

function readJson<T>(file: string): T {
    return JSON.parse(readFileSync(file, "utf8")) as T;
}

function loadJar(file: string): Jar {
    return existsSync(file) ? readJson<Jar>(file) : {};
}

function saveJar(file: string, jar: Jar): void {
    writeFileSync(file, JSON.stringify(jar), { mode: 0o600 });
    chmodSync(file, 0o600);
}

function cookieHeader(jar: Jar): string {
    return Object.entries(jar)
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
}

// Applies every Set-Cookie of an answer: a cookie with Max-Age=0 or a past Expires is removed.
function absorb(jar: Jar, res: Response): void {
    for (const line of res.headers.getSetCookie()) {
        const [pair, ...attrs] = line.split(";");
        const eq = pair.indexOf("=");
        if (eq <= 0) continue;
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        const removed = attrs.some((attr) => {
            const [key, raw] = attr.split("=").map((part) => part.trim());
            if (key.toLowerCase() === "max-age") return Number(raw) <= 0;
            if (key.toLowerCase() === "expires") return Date.parse(raw) <= Date.now();
            return false;
        });
        if (removed || value === "") delete jar[name];
        else jar[name] = value;
    }
}

async function webFetch(jarFile: string, path: string, init: RequestInit = {}): Promise<Response> {
    const jar = loadJar(jarFile);
    const headers = new Headers(init.headers);
    const cookies = cookieHeader(jar);
    if (cookies) headers.set("cookie", cookies);
    const res = await fetch(`${env("WEB_URL")}${path}`, { ...init, headers, redirect: "manual" });
    absorb(jar, res);
    saveJar(jarFile, jar);
    return res;
}

export function isSessionCookieName(name: string): boolean {
    // Auth.js prefixes the name with __Secure- (https) or __Host-; a chunked cookie ends in .<n>.
    return /^(__Secure-|__Host-)?(authjs|next-auth)\.session-token(\.\d+)?$/.test(name);
}

function hasSessionCookie(jar: Jar): boolean {
    return Object.keys(jar).some(isSessionCookieName);
}

async function login(credsFile: string, jarFile: string): Promise<void> {
    saveJar(jarFile, {});
    const csrfRes = await webFetch(jarFile, "/api/auth/csrf");
    const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
    if (!csrfToken) throw new Error(`csrf answered ${csrfRes.status} without a token`);
    const creds = readJson<Credentials>(credsFile);
    const body = new URLSearchParams({ csrfToken, email: creds.email, password: creds.password });
    const res = await webFetch(jarFile, "/api/auth/callback/credentials", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: env("WEB_URL") },
        body,
    });
    const signedIn = hasSessionCookie(loadJar(jarFile)) ? 1 : 0;
    process.stdout.write(`LOGIN code=${res.status} session_cookie=${signedIn}\n`);
    if (!signedIn) process.exit(1);
}

// One server-side session read. signed_in=1 only for a session with a user and no error.
async function read(jarFile: string): Promise<void> {
    const res = await webFetch(jarFile, "/api/auth/session");
    let body: unknown = null;
    try {
        body = await res.json();
    } catch {
        body = null;
    }
    const session = (body ?? {}) as { user?: unknown; error?: unknown };
    const error = typeof session.error === "string" ? session.error : "";
    const signedIn = res.status === 200 && session.user && !error ? 1 : 0;
    const cookie = hasSessionCookie(loadJar(jarFile)) ? 1 : 0;
    process.stdout.write(
        `READ code=${res.status} signed_in=${signedIn} error=${error || "none"} session_cookie=${cookie}\n`,
    );
}

// The forced sign-out: an org admin deletes the user (soft: the login turns off and the token
// version moves), the product's own admin route on go-api.
async function deactivate(adminCredsFile: string, userId: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error("the user id is not a uuid");
    const api = env("API_URL");
    const creds = readJson<Credentials>(adminCredsFile);
    const loginRes = await fetch(`${api}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: creds.email, password: creds.password }),
    });
    const { access_token: token } = (await loginRes.json().catch(() => ({}))) as {
        access_token?: string;
    };
    if (loginRes.status !== 200 || !token)
        throw new Error(`admin login answered ${loginRes.status}`);
    const res = await fetch(`${api}/api/v1/admin/users/${userId}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
    });
    process.stdout.write(`DEACTIVATE code=${res.status}\n`);
    if (res.status < 200 || res.status > 299) process.exit(1);
}

async function main(): Promise<void> {
    const [verb, a, b] = process.argv.slice(2);
    switch (verb) {
        case "login":
            if (!a || !b) usage();
            return login(a, b);
        case "read":
            if (!a) usage();
            return read(a);
        case "copy":
            if (!a || !b) usage();
            copyFileSync(a, b);
            chmodSync(b, 0o600);
            return;
        case "deactivate":
            if (!a || !b) usage();
            return deactivate(a, b);
        default:
            usage();
    }
}

// Run only as the entry point: the selftest imports this module for its pure helpers.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error: unknown) => {
        process.stderr.write(
            `drill failed: ${error instanceof Error ? error.message : "unknown"}\n`,
        );
        process.exit(1);
    });
}

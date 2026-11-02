// Loaded with `node --import` into every web server the mock-backed e2e suites start. The pinned
// access-token issuer must be an https origin, and the ops mock listens on plain http, so the reads
// of the issuer's discovery document and key set are sent to the mock instead. Nothing else is
// changed: a request to any other URL goes to the real fetch untouched, and with no issuer or no
// target set the guard does nothing.
const issuer = process.env.AUTH_ACCESS_TOKEN_ISSUER;
const target = process.env.E2E_AUTH_ISSUER_ORIGIN;

const realFetch = globalThis.fetch;

function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    if (input && typeof input.url === "string") return input.url;
    return undefined;
}

if (issuer && target) {
    globalThis.fetch = function fetch(input, init) {
        const url = requestUrl(input);
        if (url !== undefined && url.startsWith(`${issuer}/.well-known/`)) {
            return realFetch.call(this, `${target}${url.slice(issuer.length)}`, init);
        }
        return realFetch.call(this, input, init);
    };
}

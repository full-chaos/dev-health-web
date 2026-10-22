// CHAOS-10582. Loaded with `node --import` into every `next dev` server the e2e
// suites start. next awaits an un-timed fetch of this one URL before its
// compilers exist; a hung registry then hangs readiness. The fetch fails at
// once here and next maps the failure to an unknown version staleness. Every
// other request goes to the real fetch untouched.
export const BLOCKED_URL = "https://registry.npmjs.org/-/package/next/dist-tags";

const realFetch = globalThis.fetch;

function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    if (input && typeof input.url === "string") return input.url;
    return undefined;
}

globalThis.fetch = function fetch(input, init) {
    if (requestUrl(input) === BLOCKED_URL) {
        return Promise.reject(new TypeError("fetch blocked: next version check is off in e2e"));
    }
    return realFetch.call(this, input, init);
};

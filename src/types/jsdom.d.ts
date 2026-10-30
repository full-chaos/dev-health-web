// `jsdom` ships no types and web does not depend on @types/jsdom. Only the
// surface `src/test/setup.ts` uses is declared (CHAOS-12144).
declare module "jsdom" {
    export class JSDOM {
        constructor(html?: string, options?: { url?: string });
        readonly window: { readonly localStorage: Storage; readonly sessionStorage: Storage };
    }
}

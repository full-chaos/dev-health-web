import { describe, expect, it } from "vitest";
import { parseStrictJson, StrictJsonError } from "../strictjson";

function kindOf(text: string): string {
    try {
        parseStrictJson(text);
    } catch (e) {
        if (e instanceof StrictJsonError) return e.kind;
        throw e;
    }
    return "none";
}

describe("strict JSON: duplicate members", () => {
    it("refuses a duplicate member at the top level", () => {
        expect(kindOf('{"a":1,"a":2}')).toBe("duplicate_member");
    });
    it("refuses a duplicate member at any depth", () => {
        expect(kindOf('{"a":{"b":[{"c":1,"c":1}]}}')).toBe("duplicate_member");
    });
    it("refuses a duplicate spelled with an escape", () => {
        expect(kindOf('{"a":1,"\\u0061":2}')).toBe("duplicate_member");
    });
    it("accepts the same name in sibling objects", () => {
        expect(kindOf('{"a":{"x":1},"b":{"x":1}}')).toBe("none");
    });
    it("keeps __proto__ as an own member and refuses its duplicate", () => {
        expect(kindOf('{"__proto__":1,"__proto__":2}')).toBe("duplicate_member");
        const v = parseStrictJson('{"__proto__":1}') as Record<string, unknown>;
        expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
        expect(Object.keys(v)).toEqual(["__proto__"]);
    });
});

describe("strict JSON: numbers and shape", () => {
    it("refuses a decimal form and an exponent form", () => {
        expect(kindOf('{"n":1760000000.0}')).toBe("number");
        expect(kindOf('{"n":1.5}')).toBe("number");
        expect(kindOf('{"n":1e3}')).toBe("number");
    });
    it("refuses an integer beyond the safe range", () => {
        expect(kindOf('{"n":9007199254740993}')).toBe("number");
    });
    it("refuses trailing text, a leading zero and a bare token", () => {
        expect(kindOf('{"a":1} x')).toBe("syntax");
        expect(kindOf('{"n":01}')).toBe("syntax");
        expect(kindOf("nope")).toBe("syntax");
        expect(kindOf("")).toBe("syntax");
    });
    it("refuses nesting beyond the depth bound", () => {
        expect(kindOf("[".repeat(64) + "]".repeat(64))).toBe("depth");
    });
});

// Seeded generator: no dependency, reproducible failures.
function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}

function gen(r: () => number, depth: number): unknown {
    const pick = Math.floor(r() * (depth > 3 ? 4 : 6));
    switch (pick) {
        case 0:
            return null;
        case 1:
            return r() < 0.5;
        case 2:
            return Math.floor(r() * 2e9) - 1e9;
        case 3: {
            const alphabet = ["a", "Z", "0", " ", '"', "\\", "\n", "é", " ", "😀", "/"];
            let s = "";
            for (let i = Math.floor(r() * 6); i > 0; i--)
                s += alphabet[Math.floor(r() * alphabet.length)];
            return s;
        }
        case 4:
            return Array.from({ length: Math.floor(r() * 4) }, () => gen(r, depth + 1));
        default: {
            const o: Record<string, unknown> = {};
            const names = ["a", "b", "c", "__proto__", "constructor", "x y", "é"];
            for (let i = Math.floor(r() * 5); i > 0; i--) {
                Object.defineProperty(o, names[Math.floor(r() * names.length)], {
                    value: gen(r, depth + 1),
                    enumerable: true,
                    writable: true,
                    configurable: true,
                });
            }
            return o;
        }
    }
}

describe("strict JSON: property tests against JSON.parse", () => {
    it("equals JSON.parse for generated documents without a duplicate member", () => {
        const r = rng(20261023);
        for (let i = 0; i < 2000; i++) {
            const text = JSON.stringify(gen(r, 0));
            expect(parseStrictJson(text), text).toEqual(JSON.parse(text));
        }
    });

    it("refuses a duplicate injected at a random object in a random document", () => {
        const r = rng(10461);
        let injected = 0;
        for (let i = 0; i < 2000; i++) {
            const text = JSON.stringify(gen(r, 0));
            const positions = [...text.matchAll(/\{"/g)].map((m) => m.index as number);
            if (positions.length === 0) continue;
            const at = positions[Math.floor(r() * positions.length)];
            const nameEnd = text.indexOf('":', at + 2);
            if (nameEnd < 0) continue;
            const name = text.slice(at + 1, nameEnd + 1);
            const dup = text.slice(0, at + 1) + name + ":0," + text.slice(at + 1);
            expect(kindOf(dup), dup).toBe("duplicate_member");
            injected++;
        }
        expect(injected).toBeGreaterThan(200);
    });
});

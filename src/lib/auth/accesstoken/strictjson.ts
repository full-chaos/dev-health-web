export type StrictJsonErrorKind = "duplicate_member" | "syntax" | "number" | "depth";

export class StrictJsonError extends Error {
    readonly kind: StrictJsonErrorKind;
    constructor(kind: StrictJsonErrorKind) {
        super(kind);
        this.name = "StrictJsonError";
        this.kind = kind;
    }
}

const MAX_DEPTH = 32;
const INTEGER = /^-?(?:0|[1-9][0-9]*)$/;

// A JSON parser that refuses what JSON.parse silently accepts: a repeated
// member name at any depth (JSON.parse keeps the last), a number that is not a
// plain safe integer, and a lone surrogate. It throws StrictJsonError only; the
// message carries no input text.
export function parseStrictJson(text: string): unknown {
    let i = 0;
    const fail = (kind: StrictJsonErrorKind = "syntax"): never => {
        throw new StrictJsonError(kind);
    };
    const skip = () => {
        while (
            i < text.length &&
            (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")
        )
            i++;
    };

    const parseString = (): string => {
        if (text[i] !== '"') fail();
        i++;
        let out = "";
        for (;;) {
            if (i >= text.length) fail();
            const c = text.charCodeAt(i);
            if (c === 0x22) {
                i++;
                break;
            }
            if (c < 0x20) fail();
            if (c === 0x5c) {
                const e = text[i + 1];
                i += 2;
                switch (e) {
                    case '"':
                        out += '"';
                        break;
                    case "\\":
                        out += "\\";
                        break;
                    case "/":
                        out += "/";
                        break;
                    case "b":
                        out += "\b";
                        break;
                    case "f":
                        out += "\f";
                        break;
                    case "n":
                        out += "\n";
                        break;
                    case "r":
                        out += "\r";
                        break;
                    case "t":
                        out += "\t";
                        break;
                    case "u": {
                        const hex = text.slice(i, i + 4);
                        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail();
                        out += String.fromCharCode(parseInt(hex, 16));
                        i += 4;
                        break;
                    }
                    default:
                        fail();
                }
            } else {
                out += text[i];
                i++;
            }
        }
        if (!out.isWellFormed()) fail();
        return out;
    };

    const parseNumber = (): number => {
        const start = i;
        while (i < text.length && /[0-9eE+\-.]/.test(text[i])) i++;
        const token = text.slice(start, i);
        if (/^-?0[0-9]/.test(token)) return fail();
        if (!INTEGER.test(token)) return fail(/^-?[0-9]/.test(token) ? "number" : "syntax");
        const n = Number(token);
        if (!Number.isSafeInteger(n)) fail("number");
        return n;
    };

    const parseValue = (depth: number): unknown => {
        if (depth > MAX_DEPTH) fail("depth");
        skip();
        const c = text[i];
        if (c === "{") {
            i++;
            const obj: Record<string, unknown> = {};
            const seen = new Set<string>();
            skip();
            if (text[i] === "}") {
                i++;
                return obj;
            }
            for (;;) {
                skip();
                const name = parseString();
                if (seen.has(name)) fail("duplicate_member");
                seen.add(name);
                skip();
                if (text[i] !== ":") fail();
                i++;
                const value = parseValue(depth + 1);
                Object.defineProperty(obj, name, {
                    value,
                    enumerable: true,
                    writable: true,
                    configurable: true,
                });
                skip();
                if (text[i] === ",") {
                    i++;
                    continue;
                }
                if (text[i] === "}") {
                    i++;
                    return obj;
                }
                return fail();
            }
        }
        if (c === "[") {
            i++;
            const arr: unknown[] = [];
            skip();
            if (text[i] === "]") {
                i++;
                return arr;
            }
            for (;;) {
                arr.push(parseValue(depth + 1));
                skip();
                if (text[i] === ",") {
                    i++;
                    continue;
                }
                if (text[i] === "]") {
                    i++;
                    return arr;
                }
                return fail();
            }
        }
        if (c === '"') return parseString();
        if (text.startsWith("true", i)) {
            i += 4;
            return true;
        }
        if (text.startsWith("false", i)) {
            i += 5;
            return false;
        }
        if (text.startsWith("null", i)) {
            i += 4;
            return null;
        }
        if (c === "-" || (c !== undefined && c >= "0" && c <= "9")) return parseNumber();
        return fail();
    };

    const value = parseValue(0);
    skip();
    if (i !== text.length) fail();
    return value;
}

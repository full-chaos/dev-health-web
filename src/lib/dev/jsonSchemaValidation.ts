type JsonSchema = Readonly<Record<string, unknown>>;

const patternCache = new Map<string, RegExp>();
const RFC3339_DATE_TIME =
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function localRef(root: JsonSchema, ref: unknown): JsonSchema | null {
    if (typeof ref !== "string" || !ref.startsWith("#/$defs/")) return null;
    const defs = root.$defs;
    const name = ref.slice("#/$defs/".length);
    return isRecord(defs) && isRecord(defs[name]) ? defs[name] : null;
}

function matchesType(value: unknown, type: unknown): boolean {
    switch (type) {
        case "array":
            return Array.isArray(value);
        case "boolean":
            return typeof value === "boolean";
        case "integer":
            return typeof value === "number" && Number.isInteger(value);
        case "null":
            return value === null;
        case "number":
            return typeof value === "number" && Number.isFinite(value);
        case "object":
            return isRecord(value);
        case "string":
            return typeof value === "string";
        default:
            return false;
    }
}

function isDateTime(value: string): boolean {
    const match = RFC3339_DATE_TIME.exec(value);
    if (!match) return false;
    const [
        ,
        yearText,
        monthText,
        dayText,
        hourText,
        minuteText,
        secondText,
        zoneHourText,
        zoneMinuteText,
    ] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return (
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= daysInMonth &&
        Number(hourText) <= 23 &&
        Number(minuteText) <= 59 &&
        Number(secondText) <= 60 &&
        (zoneHourText === undefined || Number(zoneHourText) <= 23) &&
        (zoneMinuteText === undefined || Number(zoneMinuteText) <= 59)
    );
}

function validateString(value: string, schema: JsonSchema): boolean {
    const length = [...value].length;
    if (typeof schema.minLength === "number" && length < schema.minLength) return false;
    if (typeof schema.maxLength === "number" && length > schema.maxLength) return false;
    if (typeof schema["x-max-utf8-bytes"] === "number") {
        if (new TextEncoder().encode(value).byteLength > schema["x-max-utf8-bytes"]) return false;
    }
    if (typeof schema.pattern === "string") {
        let pattern = patternCache.get(schema.pattern);
        if (!pattern) {
            pattern = new RegExp(schema.pattern, "u");
            patternCache.set(schema.pattern, pattern);
        }
        if (!pattern.test(value)) return false;
    }
    return schema.format !== "date-time" || isDateTime(value);
}

function validateNode(value: unknown, schema: JsonSchema, root: JsonSchema): boolean {
    if (schema.$ref !== undefined) {
        const resolved = localRef(root, schema.$ref);
        return resolved !== null && validateNode(value, resolved, root);
    }
    if (Array.isArray(schema.anyOf)) {
        return schema.anyOf.some(
            (candidate) => isRecord(candidate) && validateNode(value, candidate, root),
        );
    }
    if (schema.const !== undefined && !Object.is(value, schema.const)) return false;
    if (
        Array.isArray(schema.enum) &&
        !schema.enum.some((candidate) => Object.is(value, candidate))
    ) {
        return false;
    }
    if (schema.type !== undefined && !matchesType(value, schema.type)) return false;

    if (typeof value === "string" && !validateString(value, schema)) return false;
    if (typeof value === "number") {
        if (typeof schema.minimum === "number" && value < schema.minimum) return false;
        if (typeof schema.maximum === "number" && value > schema.maximum) return false;
    }
    if (Array.isArray(value)) {
        if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
        if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
        const itemSchema = isRecord(schema.items) ? schema.items : null;
        if (itemSchema && !value.every((item) => validateNode(item, itemSchema, root))) {
            return false;
        }
    }
    if (isRecord(value)) {
        const properties = isRecord(schema.properties) ? schema.properties : {};
        if (
            Array.isArray(schema.required) &&
            schema.required.some((key) => typeof key !== "string" || !Object.hasOwn(value, key))
        ) {
            return false;
        }
        if (schema.additionalProperties === false) {
            if (Object.keys(value).some((key) => !Object.hasOwn(properties, key))) return false;
        }
        for (const [key, propertySchema] of Object.entries(properties)) {
            if (
                Object.hasOwn(value, key) &&
                (!isRecord(propertySchema) || !validateNode(value[key], propertySchema, root))
            ) {
                return false;
            }
        }
    }
    return true;
}

/** CSP-safe validation for the pinned browser contract subset; performs no code generation. */
export function validatePinnedJsonSchema(value: unknown, schema: unknown): boolean {
    return isRecord(schema) && validateNode(value, schema, schema);
}

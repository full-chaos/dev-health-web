/**
 * Eval-free checks of the ACR thread bodies (CHAOS-11956).
 *
 * The browser reads `GET /threads` and `GET /threads/{id}` directly and must check each body against
 * `context_fabric_thread.v1` / `context_fabric_thread_list.v1` before the store maps it. The repo's
 * checker (`validateAcrContract`) compiles Ajv validators with `new Function`; production CSP has no
 * `unsafe-eval`, so Ajv cannot run in the browser there, while e2e test mode allows eval and would
 * hide the failure. These parsers are plain code instead. They are held equal to Ajv by the
 * differential oracle `__tests__/threadContract.differential.test.ts`, which builds its cases from
 * the schema files, so a schema change that the parsers do not follow turns that test red.
 *
 * Do not import `ajv` or `@/lib/acr/contracts` here: both would put Ajv in the browser bundle.
 */
import type {
    ThreadListView,
    ThreadSummaryView,
    ThreadTurnState,
    ThreadTurnView,
    ThreadView,
} from "@/components/ask-dev/conversation/transport";

type Json = Record<string, unknown>;

// Same test Ajv emits for `type: "object"`: an array and null are not objects.
function isObject(value: unknown): value is Json {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Ajv emits `data.key === undefined` for `required`, and checks a property only when it is not undefined.
function present(obj: Json, key: string): boolean {
    return obj[key] !== undefined;
}

// Ajv `type: "integer"`.
function isInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value % 1 === 0;
}

// Ajv counts Unicode code points (`ucs2length`): a valid surrogate pair is one, a lone surrogate is one.
function codePointLength(text: string): number {
    let length = 0;
    let pos = 0;
    while (pos < text.length) {
        length += 1;
        const high = text.charCodeAt(pos);
        pos += 1;
        if (high >= 0xd800 && high <= 0xdbff && pos < text.length) {
            if ((text.charCodeAt(pos) & 0xfc00) === 0xdc00) pos += 1;
        }
    }
    return length;
}

function stringIn(value: unknown, min: number, max: number): value is string {
    if (typeof value !== "string") return false;
    const length = codePointLength(value);
    return length >= min && length <= max;
}

const ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/u;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,512}$/u;
const TIMESTAMP_PATTERN =
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/u;

// ajv-formats "full" mode `date-time`, reproduced rather than imported so no formats module ships.
const DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
const TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
const DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const DATE_TIME_SEPARATOR = /t|\s/i;

function isLeapYear(year: number): boolean {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isFullDate(text: string): boolean {
    const matches = DATE.exec(text);
    if (matches === null) return false;
    const year = Number(matches[1]);
    const month = Number(matches[2]);
    const day = Number(matches[3]);
    if (month < 1 || month > 12 || day < 1) return false;
    return day <= (month === 2 && isLeapYear(year) ? 29 : (DAYS[month] ?? 0));
}

function isFullTime(text: string): boolean {
    const matches = TIME.exec(text);
    if (matches === null) return false;
    const hr = Number(matches[1]);
    const min = Number(matches[2]);
    const sec = Number(matches[3]);
    const zone = matches[4];
    const sign = matches[5] === "-" ? -1 : 1;
    const zoneHours = Number(matches[6] ?? 0);
    const zoneMinutes = Number(matches[7] ?? 0);
    // The zone is required (strict mode of `date-time`).
    if (zoneHours > 23 || zoneMinutes > 59 || !zone) return false;
    if (hr <= 23 && min <= 59 && sec < 60) return true;
    // A leap second must fall on 23:59:60 UTC.
    const utcMin = min - zoneMinutes * sign;
    const utcHr = hr - zoneHours * sign - (utcMin < 0 ? 1 : 0);
    return (utcHr === 23 || utcHr === -1) && (utcMin === 59 || utcMin === -1) && sec < 61;
}

function isDateTime(text: string): boolean {
    const parts = text.split(DATE_TIME_SEPARATOR);
    return parts.length === 2 && isFullDate(parts[0] ?? "") && isFullTime(parts[1] ?? "");
}

// `format: date-time` plus the schema's `pattern`; the pattern is the stricter of the two.
function isTimestamp(value: unknown): value is string {
    return typeof value === "string" && isDateTime(value) && TIMESTAMP_PATTERN.test(value);
}

function isId(value: unknown): value is string {
    return stringIn(value, 8, 128) && ID_PATTERN.test(value);
}

function isCursor(value: unknown): value is string {
    return stringIn(value, 1, 512) && CURSOR_PATTERN.test(value);
}

function isRetentionDays(value: unknown): boolean {
    return isInteger(value) && (value === 0 || value === 30);
}

function isTurnCount(value: unknown): value is number {
    return isInteger(value) && value >= 1 && value <= 1000000;
}

function hasOnlyKeys(obj: Json, allowed: readonly string[]): boolean {
    // `for...in` as Ajv does, so inherited enumerable keys count too.
    for (const key in obj) {
        if (!allowed.includes(key)) return false;
    }
    return true;
}

const TURN_KEYS = [
    "submission_id",
    "state",
    "question",
    "result_id",
    "result_withheld",
    "admitted_at",
    "updated_at",
] as const;

function isTurnState(value: unknown): value is ThreadTurnState {
    return (
        value === "running" || value === "done" || value === "done_unsaved" || value === "abandoned"
    );
}

function parseTurn(value: unknown): ThreadTurnView | null {
    if (!isObject(value) || !hasOnlyKeys(value, TURN_KEYS)) return null;
    const { submission_id, state, question, result_id, result_withheld, admitted_at, updated_at } =
        value;
    if (!isId(submission_id) || !isTurnState(state)) return null;
    if (question !== undefined && !stringIn(question, 1, 8000)) return null;
    if (result_id !== undefined && !stringIn(result_id, 8, 256)) return null;
    if (result_withheld !== undefined && result_withheld !== true) return null;
    if (!isTimestamp(admitted_at) || !isTimestamp(updated_at)) return null;
    const hasResultId = present(value, "result_id");
    const hasWithheld = present(value, "result_withheld");
    // done: exactly one of the two; any other state: neither.
    if (state === "done" ? hasResultId === hasWithheld : hasResultId || hasWithheld) return null;
    return {
        submissionId: submission_id,
        state,
        question: typeof question === "string" ? question : null,
        resultId: typeof result_id === "string" ? result_id : null,
        resultWithheld: result_withheld === true,
        admittedAt: admitted_at,
    };
}

const THREAD_KEYS = [
    "schema_version",
    "thread_id",
    "retention_days",
    "turn_count",
    "created_at",
    "last_turn_at",
    "expires_at",
    "turns",
    "earlier_turns_cursor",
] as const;

/** Returns the view of a `context_fabric_thread.v1` body, or `null` when the schema would refuse it. */
export function parseThread(value: unknown): ThreadView | null {
    if (!isObject(value) || !hasOnlyKeys(value, THREAD_KEYS)) return null;
    const {
        schema_version,
        thread_id,
        retention_days,
        turn_count,
        created_at,
        last_turn_at,
        expires_at,
        turns,
        earlier_turns_cursor,
    } = value;
    if (schema_version !== "context_fabric_thread.v1") return null;
    if (!isId(thread_id) || !isRetentionDays(retention_days) || !isTurnCount(turn_count)) {
        return null;
    }
    if (!isTimestamp(created_at) || !isTimestamp(last_turn_at) || !isTimestamp(expires_at)) {
        return null;
    }
    if (!Array.isArray(turns) || turns.length < 1 || turns.length > 100) return null;
    if (earlier_turns_cursor !== undefined && !isCursor(earlier_turns_cursor)) return null;
    const mapped: ThreadTurnView[] = [];
    for (const turn of turns as unknown[]) {
        const parsed = parseTurn(turn);
        if (parsed === null) return null;
        mapped.push(parsed);
    }
    return {
        threadId: thread_id,
        turnCount: turn_count,
        createdAt: created_at,
        lastTurnAt: last_turn_at,
        expiresAt: expires_at,
        turns: mapped,
        earlierTurnsCursor: typeof earlier_turns_cursor === "string" ? earlier_turns_cursor : null,
    };
}

const SUMMARY_KEYS = [
    "thread_id",
    "retention_days",
    "turn_count",
    "created_at",
    "last_turn_at",
    "expires_at",
] as const;

function parseSummary(value: unknown): ThreadSummaryView | null {
    if (!isObject(value) || !hasOnlyKeys(value, SUMMARY_KEYS)) return null;
    const { thread_id, retention_days, turn_count, created_at, last_turn_at, expires_at } = value;
    if (!isId(thread_id) || !isRetentionDays(retention_days) || !isTurnCount(turn_count)) {
        return null;
    }
    if (!isTimestamp(created_at) || !isTimestamp(last_turn_at) || !isTimestamp(expires_at)) {
        return null;
    }
    return {
        threadId: thread_id,
        turnCount: turn_count,
        createdAt: created_at,
        lastTurnAt: last_turn_at,
        expiresAt: expires_at,
    };
}

const LIST_KEYS = ["schema_version", "threads", "next_cursor"] as const;

/** Returns the view of a `context_fabric_thread_list.v1` body, or `null` when the schema would refuse it. */
export function parseThreadList(value: unknown): ThreadListView | null {
    if (!isObject(value) || !hasOnlyKeys(value, LIST_KEYS)) return null;
    const { schema_version, threads, next_cursor } = value;
    if (schema_version !== "context_fabric_thread_list.v1") return null;
    if (!Array.isArray(threads) || threads.length > 50) return null;
    if (next_cursor !== undefined && !isCursor(next_cursor)) return null;
    // A cursor only follows a page that lists at least one thread.
    if (present(value, "next_cursor") && threads.length < 1) return null;
    const mapped: ThreadSummaryView[] = [];
    for (const thread of threads as unknown[]) {
        const parsed = parseSummary(thread);
        if (parsed === null) return null;
        mapped.push(parsed);
    }
    return { threads: mapped, nextCursor: typeof next_cursor === "string" ? next_cursor : null };
}

import { logger } from "@/lib/logger";

import {
    TransportFailure,
    TransportRefusal,
    type AskDevTransport,
    type FeedbackFlag,
    type FeedbackView,
} from "./transport";

/**
 * The answer feedback of one tab (CHAOS-11958; E6 web design v5 §6), above both surfaces: the
 * panel and `/dev` show the same state for a result.
 *
 * - **Per result.** One entry per `result_id`. A reused answer names another turn's result, so every
 *   turn that shows it shares the entry.
 * - **Partition.** The provider binds it to the conversation store's (org, principal) key. Another
 *   key drops every entry and aborts every read and write; an answer of an older partition changes
 *   nothing. A thread switch changes nothing here.
 * - **Reads.** `ensure` reads a result's feedback once per partition. ACR's 404 (not the caller's
 *   Ask Dev result, or not served now) hides the controls; a failed read disables them, with "Try
 *   again" (a GET).
 * - **Writes.** One POST at a time per result, with the whole latest choice: changes made while one
 *   is out are sent together in the next. A failed write rolls back only the flags it changed that
 *   the user has not changed since; later choices are kept and sent next.
 * - **Nothing leaves but the flags.** There is no free text, no product telemetry event, and the logs
 *   carry the result id, a local revision and a status: never a flag value.
 *
 * It holds no token; ACR authorizes every call (INV-1).
 */

/** The two questions, in the order the controls show them. */
export const FEEDBACK_QUESTIONS = ["correct", "useful"] as const;

export type FeedbackQuestion = (typeof FEEDBACK_QUESTIONS)[number];

export type FeedbackFlags = Readonly<Record<FeedbackQuestion, FeedbackFlag>>;

export type FeedbackEntry = {
    /**
     * `loading`: the first read is out. `ready`: the controls work. `unavailable`: ACR's 404, the
     * controls are hidden. `read_failed`: the read failed; "Try again" reads again.
     */
    readonly state: "loading" | "ready" | "unavailable" | "read_failed";
    /** What ACR last answered it stores. */
    readonly confirmed: FeedbackFlags;
    /** What the controls show: the user's latest choice, sent or about to be. */
    readonly desired: FeedbackFlags;
    /** A write is out. */
    readonly saving: boolean;
    /** The last failed write's change was rolled back. The next choice clears it. */
    readonly notSaved: boolean;
};

const UNSET: FeedbackFlags = { correct: "unset", useful: "unset" };

const LOADING: FeedbackEntry = {
    state: "loading",
    confirmed: UNSET,
    desired: UNSET,
    saving: false,
    notSaved: false,
};

/** The write bookkeeping of one result. Local only: ACR's answer carries no revision. */
type Writes = {
    inFlight: boolean;
    /** The revision of the last write sent (for the logs). */
    revision: number;
    /** Bumped by every choice. */
    choices: number;
    /** For each flag, the `choices` count of the user's last change to it. */
    readonly changedAt: Record<FeedbackQuestion, number>;
};

const flagsOf = (view: FeedbackView): FeedbackFlags => ({
    correct: view.correct,
    useful: view.useful,
});

const sameFlags = (left: FeedbackFlags, right: FeedbackFlags): boolean =>
    left.correct === right.correct && left.useful === right.useful;

function failureStatus(error: unknown): number | string {
    if (error instanceof TransportRefusal) return error.status;
    if (error instanceof TransportFailure) return error.reason;
    return "network";
}

const notFound = (error: unknown): boolean =>
    error instanceof TransportRefusal && error.status === 404;

export class FeedbackStore {
    private readonly transport: AskDevTransport;
    private readonly listeners = new Set<() => void>();
    private partition: string | null | undefined = undefined;
    /** Bumped by every partition change: a read or write of an older epoch changes nothing. */
    private epoch = 0;
    private abort = new AbortController();
    private entries = new Map<string, FeedbackEntry>();
    private writes = new Map<string, Writes>();

    constructor(options: { readonly transport: AskDevTransport }) {
        this.transport = options.transport;
    }

    readonly subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    /** The entry of `resultId`, or `undefined` before `ensure` (stable until it changes). */
    readonly entry = (resultId: string): FeedbackEntry | undefined => this.entries.get(resultId);

    /**
     * The entry of `resultId` as the session `partition` may see it: `undefined` while the store is
     * still bound to another key. The provider rebinds in an effect, after the commit of a switch;
     * without this, that commit would paint the old (org, principal)'s choice (codex r1 on #1658).
     * An `undefined` partition (the session is loading; a refetch is not a switch) sees the entry.
     */
    readonly entryFor = (
        resultId: string,
        partition: string | null | undefined,
    ): FeedbackEntry | undefined =>
        partition === undefined || partition === this.partition
            ? this.entries.get(resultId)
            : undefined;

    /** True when the store is bound to the session `partition` (or to some key while it loads). */
    readonly boundTo = (partition: string | null | undefined): boolean =>
        partition === undefined ? this.partition !== undefined : partition === this.partition;

    /**
     * Binds the store to one (org, principal) key, or to none (`null`: signed out). Another key than
     * the bound one drops everything; the first bind drops nothing.
     */
    setPartition(key: string | null): void {
        if (key === this.partition) return;
        const rebind = this.partition !== undefined;
        this.partition = key;
        if (rebind) this.reset();
        else this.emit();
    }

    /** Drops every entry and aborts every read and write (a partition change, or the shell left). */
    reset(): void {
        this.epoch += 1;
        this.abort.abort();
        this.abort = new AbortController();
        this.entries = new Map();
        this.writes = new Map();
        this.emit();
    }

    /** Reads the feedback of `resultId` unless this partition already has it (or is reading it). */
    ensure(resultId: string): void {
        if (!this.entries.has(resultId)) this.read(resultId);
    }

    /** "Try again" after a failed read: a GET. Refused unless the read failed. */
    retryRead(resultId: string): boolean {
        if (this.entries.get(resultId)?.state !== "read_failed") return false;
        this.read(resultId);
        return true;
    }

    /**
     * The user pressed `value` for `question`: pressing the value already chosen clears it
     * (`unset`). Shown at once, and sent with the next write. Refused unless the entry is ready.
     */
    choose(resultId: string, question: FeedbackQuestion, value: "yes" | "no"): boolean {
        const entry = this.entries.get(resultId);
        if (entry?.state !== "ready") return false;
        const writes = this.writesOf(resultId);
        writes.choices += 1;
        writes.changedAt[question] = writes.choices;
        const chosen: FeedbackFlag = entry.desired[question] === value ? "unset" : value;
        this.put(resultId, {
            ...entry,
            desired: { ...entry.desired, [question]: chosen },
            notSaved: false,
        });
        this.drain(resultId);
        return true;
    }

    private read(resultId: string): void {
        const epoch = this.epoch;
        const { signal } = this.abort;
        this.put(resultId, LOADING);
        void (async () => {
            let answer: FeedbackView | null;
            try {
                answer = await this.transport.readFeedback({ resultId, signal });
                if (answer !== null && answer.resultId !== resultId) {
                    throw new TransportFailure("invalid_upstream");
                }
            } catch (error) {
                if (!this.owns(epoch, "feedback_read", 0)) return;
                if (notFound(error)) {
                    this.put(resultId, { ...LOADING, state: "unavailable" });
                    return;
                }
                logger.warn(
                    { result_id: resultId, status: failureStatus(error) },
                    "ask-dev feedback not read",
                );
                this.put(resultId, { ...LOADING, state: "read_failed" });
                return;
            }
            if (!this.owns(epoch, "feedback_read", 0)) return;
            if (answer === null) {
                this.put(resultId, { ...LOADING, state: "unavailable" });
                return;
            }
            const stored = flagsOf(answer);
            this.put(resultId, { ...LOADING, state: "ready", confirmed: stored, desired: stored });
        })();
    }

    /** Sends the latest choice of `resultId` unless a write is out or nothing changed. */
    private drain(resultId: string): void {
        const entry = this.entries.get(resultId);
        const writes = this.writesOf(resultId);
        if (entry?.state !== "ready" || writes.inFlight) return;
        if (sameFlags(entry.desired, entry.confirmed)) {
            if (entry.saving) this.put(resultId, { ...entry, saving: false });
            return;
        }
        const epoch = this.epoch;
        const { signal } = this.abort;
        const sent = entry.desired;
        const sentAt = { ...writes.changedAt };
        writes.revision += 1;
        const revision = writes.revision;
        writes.inFlight = true;
        this.put(resultId, { ...entry, saving: true });
        void (async () => {
            let answer: FeedbackView;
            try {
                answer = await this.transport.setFeedback({ resultId, ...sent, signal });
                if (answer.resultId !== resultId) throw new TransportFailure("invalid_upstream");
            } catch (error) {
                if (!this.owns(epoch, "feedback_write", revision)) return;
                writes.inFlight = false;
                const status = failureStatus(error);
                logger.info(
                    { result_id: resultId, revision, status },
                    "ask-dev feedback not saved",
                );
                if (notFound(error)) {
                    // ACR no longer takes feedback on this result: the controls go.
                    this.put(resultId, { ...LOADING, state: "unavailable" });
                    return;
                }
                this.rollBack(resultId, sentAt);
                this.drain(resultId);
                return;
            }
            if (!this.owns(epoch, "feedback_write", revision)) return;
            writes.inFlight = false;
            logger.info({ result_id: resultId, revision, status: 200 }, "ask-dev feedback saved");
            this.confirm(resultId, flagsOf(answer), sentAt);
            this.drain(resultId);
        })();
    }

    /**
     * ACR stored `stored`. A flag the user has not changed since the write was sent shows what ACR
     * stored; a later choice is kept and goes out with the next write.
     */
    private confirm(
        resultId: string,
        stored: FeedbackFlags,
        sentAt: Readonly<Record<FeedbackQuestion, number>>,
    ): void {
        const entry = this.entries.get(resultId);
        if (entry === undefined) return;
        const changedAt = this.writesOf(resultId).changedAt;
        const desired = { ...entry.desired };
        for (const question of FEEDBACK_QUESTIONS) {
            if (changedAt[question] === sentAt[question]) desired[question] = stored[question];
        }
        this.put(resultId, { ...entry, confirmed: stored, desired });
    }

    /**
     * A write failed: each flag the user has not changed since it was sent returns to what ACR
     * confirmed (for a flag the write did not change, that is what it already shows). A flag the
     * user changed again keeps that later choice, which is sent next.
     */
    private rollBack(resultId: string, sentAt: Readonly<Record<FeedbackQuestion, number>>): void {
        const entry = this.entries.get(resultId);
        if (entry === undefined) return;
        const changedAt = this.writesOf(resultId).changedAt;
        const desired = { ...entry.desired };
        for (const question of FEEDBACK_QUESTIONS) {
            if (changedAt[question] === sentAt[question]) {
                desired[question] = entry.confirmed[question];
            }
        }
        this.put(resultId, { ...entry, desired, notSaved: true });
    }

    /** True when an answer of `epoch` may still commit; else logs the dropped answer. */
    private owns(epoch: number, operation: string, revision: number): boolean {
        if (epoch === this.epoch) return true;
        logger.info({ operation, scope: "feedback", revision }, "ask-dev stale answer dropped");
        return false;
    }

    private writesOf(resultId: string): Writes {
        let writes = this.writes.get(resultId);
        if (writes === undefined) {
            writes = {
                inFlight: false,
                revision: 0,
                choices: 0,
                changedAt: { correct: 0, useful: 0 },
            };
            this.writes.set(resultId, writes);
        }
        return writes;
    }

    private put(resultId: string, entry: FeedbackEntry): void {
        this.entries.set(resultId, entry);
        this.emit();
    }

    private emit(): void {
        for (const listener of this.listeners) listener();
    }
}

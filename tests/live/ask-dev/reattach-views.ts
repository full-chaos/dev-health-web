/**
 * CHAOS-12233: what the reattach and cancel cases read off a run's event streams. Pure TypeScript
 * with no Playwright import, so `ci/__tests__/ask-dev-reattach-views.test.ts` can plant each gap,
 * repeat or silence and prove it is reported.
 */

/** One server-sent event of an investigation stream, or a comment line (`: keepalive`). */
export type StreamFrame = {
    readonly seq?: number;
    readonly type?: string;
    readonly comment?: string;
};

/** A piece of a stream as the page read it, and when (epoch ms). */
export type StreamChunk = { readonly at: number; readonly text: string };

/**
 * The frames of a stream body: each event's `seq` and `type` from its `data` (JSON), and each comment
 * line's text. A frame whose data is not JSON has no seq: never a guessed one.
 */
export function framesOf(body: string): StreamFrame[] {
    const frames: StreamFrame[] = [];
    for (const block of body.split(/\r?\n\r?\n/u)) {
        const lines = block.split(/\r?\n/u).filter((line) => line !== "");
        if (lines.length === 0) continue;
        const comment = lines.find((line) => line.startsWith(":"));
        const data = lines
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice("data:".length).trimStart())
            .join("\n");
        if (data === "") {
            if (comment !== undefined) frames.push({ comment: comment.slice(1).trim() });
            continue;
        }
        let event: unknown;
        try {
            event = JSON.parse(data);
        } catch {
            frames.push({});
            continue;
        }
        const { seq, type } = (event ?? {}) as { seq?: unknown; type?: unknown };
        frames.push({
            ...(typeof seq === "number" ? { seq } : {}),
            ...(typeof type === "string" ? { type } : {}),
        });
    }
    return frames;
}

/** Each seq that does not follow the one before it by exactly one, in a list's own words. */
function steps(name: string, seqs: readonly number[]): string[] {
    return seqs.flatMap((seq, index) =>
        index > 0 && seq !== seqs[index - 1]! + 1
            ? [`${name}: seq ${String(seq)} after ${String(seqs[index - 1])}`]
            : [],
    );
}

/**
 * AC-5: the create stream's events run 1, 2, …; the attach sends `Last-Event-ID` = the cursor (the
 * create's last seq, or none) and resumes at the cursor's next, one by one. Any gap, repeat or wrong
 * start is reported; an attach with no event resumed nothing.
 */
export function seqMismatches(
    created: readonly number[],
    attached: readonly number[],
    cursor: number | null,
): string[] {
    const mismatches = steps("create", created);
    const last = created.at(-1) ?? null;
    if (cursor !== null && last !== null && cursor !== last) {
        mismatches.push(
            `the cursor ${String(cursor)} is not the last seq the create stream gave (${String(last)})`,
        );
    }
    if (attached.length === 0) return [...mismatches, "attach: no event"];
    const expected = (cursor ?? 0) + 1;
    if (attached[0] !== expected) {
        mismatches.push(
            `attach: starts at seq ${String(attached[0])}, the cursor was ${String(cursor)}`,
        );
    }
    return [...mismatches, ...steps("attach", attached)];
}

/** AC-7: the longest time a stream sent no byte, from its first chunk to `until` (epoch ms). */
export function longestSilenceMs(chunks: readonly StreamChunk[], until: number): number {
    if (chunks.length === 0) return Number.POSITIVE_INFINITY;
    let longest = 0;
    chunks.forEach((chunk, index) => {
        const next = chunks[index + 1]?.at ?? until;
        longest = Math.max(longest, next - chunk.at);
    });
    return longest;
}

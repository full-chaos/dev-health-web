"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { useAdminTier } from "@/components/admin/AdminTierContext";
import type { SubjectHint } from "@/lib/acr/generated";
import {
    PAGE_CONTEXT_HINT_SOURCE,
    proposePageContext,
    type PageContextProposal,
    type PageEntityInput,
    type PageEntityRef,
} from "@/lib/ask-dev/page-context";
import { logger } from "@/lib/logger";

/**
 * Typed page context in the shell (plan §2.4, item I-22, CHAOS-3584).
 *
 * - **Registration:** a page states the entities it shows with `useAskDevPageContext(refs)` (the
 *   pages themselves are CHAOS-11938). The registry of CHAOS-11936 turns them into a proposal for
 *   the current route: only an approved surface proposes, only its scope kinds, with no DOM text
 *   and no filter state.
 * - **Proposal, not scope:** the proposal is shown as chips the user can remove. Nothing is sent
 *   when the panel opens and nothing is submitted on its own. Navigation changes the proposal (and
 *   forgets removals); a question already sent keeps the hints it was sent with.
 * - **Hints only:** what is left goes with the next question as `requested_scope.subject_hints[]`
 *   (`source: "ask_dev_page_context"`). A hint never binds a subject: ACR resolves it again and
 *   authorizes every call.
 * - **Gate:** without the organization's `ask_dev_contextual_entrypoints` feature there is no
 *   proposal: no chip and no page hint.
 */
export const CONTEXTUAL_ENTRYPOINTS_FEATURE = "ask_dev_contextual_entrypoints";

type Snapshot = readonly PageEntityInput[];

/** The registrations of the mounted page, in registration order. */
class PageContextRegistry {
    private readonly registrations = new Map<number, Snapshot>();
    private readonly listeners = new Set<() => void>();
    private nextId = 0;
    private snapshot: Snapshot = [];

    readonly subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    readonly getSnapshot = (): Snapshot => this.snapshot;

    register(refs: Snapshot): number {
        const id = this.nextId++;
        this.registrations.set(id, refs);
        this.publish();
        return id;
    }

    unregister(id: number): void {
        if (this.registrations.delete(id)) this.publish();
    }

    private publish(): void {
        this.snapshot = [...this.registrations.values()].flat();
        for (const listener of this.listeners) listener();
    }
}

const refKey = (ref: { readonly kind: string; readonly id: string }) =>
    JSON.stringify([ref.kind, ref.id]);

type PageContextValue = {
    readonly registry: PageContextRegistry;
    /** The proposal for this page, before the user's removals; `null` when nothing is proposed. */
    readonly proposal: PageContextProposal | null;
    /** The entities that go with the next question: the proposal less what the user removed. */
    readonly refs: readonly PageEntityRef[];
    readonly remove: (ref: PageEntityRef) => void;
};

const PageContext = createContext<PageContextValue | null>(null);

const noRefs: readonly PageEntityInput[] = [];
const noSubscription = () => () => undefined;

export function AskDevPageContextProvider({ children }: { children: ReactNode }) {
    const [registry] = useState(() => new PageContextRegistry());
    const pathname = usePathname() ?? "";
    const { features } = useAdminTier();
    const enabled = features[CONTEXTUAL_ENTRYPOINTS_FEATURE] === true;
    const registered = useSyncExternalStore(registry.subscribe, registry.getSnapshot, () => noRefs);

    const proposal = useMemo(
        () => (enabled ? proposePageContext({ pathname, entityRefs: registered }) : null),
        [enabled, pathname, registered],
    );
    // The user's removals belong to this proposal: another page (or other entities) starts afresh.
    const signature = proposal === null ? null : JSON.stringify([pathname, proposal.entityRefs]);
    const [removed, setRemoved] = useState<{ signature: string | null; keys: readonly string[] }>({
        signature,
        keys: [],
    });
    if (removed.signature !== signature) setRemoved({ signature, keys: [] });

    useEffect(() => {
        if (proposal === null || proposal.dropped.length === 0) return;
        // Kinds and reasons only: never an id, a label or the route's entities.
        logger.warn(
            { route_id: proposal.routeId, dropped: proposal.dropped },
            "Ask Dev page context entities dropped",
        );
    }, [proposal]);

    const remove = useCallback(
        (ref: PageEntityRef) =>
            setRemoved((current) => ({ ...current, keys: [...current.keys, refKey(ref)] })),
        [],
    );
    const refs = useMemo(
        () => (proposal?.entityRefs ?? []).filter((ref) => !removed.keys.includes(refKey(ref))),
        [proposal, removed],
    );
    const value = useMemo(
        () => ({ registry, proposal, refs, remove }),
        [registry, proposal, refs, remove],
    );
    return (
        <PageContext.Provider value={value}>
            {TEST_MODE ? <TestModePageContext /> : null}
            {children}
        </PageContext.Provider>
    );
}

/**
 * A page states the entities it shows, while it is mounted (CHAOS-11938 calls this on its pages).
 * Each entity is kind, id and label as the page knows them; the registry keeps only what this route
 * may propose. Registering sends nothing.
 */
export function useAskDevPageContext(entityRefs: readonly PageEntityInput[]): void {
    const value = useContext(PageContext);
    const registry = value?.registry ?? null;
    // Rebuilt field by field, and keyed by content: a new array with the same entities re-registers
    // nothing, and nothing else the page's objects hold is kept.
    const key = JSON.stringify(entityRefs.map((ref) => [ref.kind, ref.id, ref.label]));
    useEffect(() => {
        if (registry === null) return;
        const refs = (JSON.parse(key) as [string, string, string][]).map(([kind, id, label]) => ({
            kind,
            id,
            label,
        }));
        const id = registry.register(refs);
        return () => registry.unregister(id);
    }, [registry, key]);
}

/** The proposal shown as chips, and the entities the next question sends. */
export function useAskDevPageProposal(): {
    readonly proposal: PageContextProposal | null;
    readonly refs: readonly PageEntityRef[];
    readonly remove: (ref: PageEntityRef) => void;
} {
    const value = useContext(PageContext);
    return {
        proposal: value?.proposal ?? null,
        refs: value?.refs ?? [],
        remove: value?.remove ?? (() => undefined),
    };
}

/** The hints the next question carries from this page (empty when nothing is proposed). */
export function pageHintsOf(refs: readonly PageEntityRef[]): SubjectHint[] {
    return refs.map((ref) => ({
        kind: ref.kind,
        id: ref.id,
        label: ref.label,
        source: PAGE_CONTEXT_HINT_SOURCE,
    }));
}

// ---------------------------------------------------------------------------------------------
// Test mode only: a Playwright run puts the entities of "the page" in session storage, so the suite
// can show and send page context before the pages register their own (CHAOS-11938). It never
// ships: a production build inlines `process.env.NODE_ENV`, so `TEST_MODE` is `false` and this
// drops (`check:client-bundle` rule K6 fails the build if a test-mode key leaks).

export const TEST_MODE_PAGE_CONTEXT_KEY = "ask-dev:test-mode-page-context";

const TEST_MODE =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

function readTestModeRefs(): readonly PageEntityInput[] {
    try {
        const raw = window.sessionStorage.getItem(TEST_MODE_PAGE_CONTEXT_KEY);
        const parsed: unknown = raw === null ? [] : JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as PageEntityInput[]) : [];
    } catch {
        return [];
    }
}

function TestModePageContext() {
    const refs = useSyncExternalStore(
        noSubscription,
        // One read per page load; a stable array, so `useSyncExternalStore` sees no change.
        () => cachedTestModeRefs(),
        () => noRefs,
    );
    useAskDevPageContext(refs);
    return null;
}

let testModeCache: readonly PageEntityInput[] | null = null;
function cachedTestModeRefs(): readonly PageEntityInput[] {
    testModeCache ??= readTestModeRefs();
    return testModeCache;
}

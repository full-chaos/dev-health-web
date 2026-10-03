"use client";

import {
    Suspense,
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { useAdminNav } from "@/components/admin/AdminTabs";
import { useAdminTier } from "@/components/admin/AdminTierContext";
import { Dialog } from "@/components/ui/Dialog";
import { navAreas } from "@/lib/navigation/areas";

import { filterPaletteEntries, paletteEntries } from "./commandPaletteEntries";
import { shellHref } from "./shellHref";
import { useShellNavParams } from "./useShellNavParams";

const TRIGGER_LABEL = "Find a product surface…";

const subscribeNever = () => () => {};
const serverHint = () => "Ctrl K";
const clientHint = () => (/mac|iphone|ipad/i.test(navigator.userAgent) ? "⌘ K" : "Ctrl K");

/** The palette key: Cmd+K on macOS, Ctrl+K elsewhere (either works anywhere). */
export const isPaletteKey = (event: KeyboardEvent) =>
    (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k";

/** Mounted only while open: the registry, the router and the state are read when it is needed. */
function Palette({ onClose }: { onClose: () => void }) {
    const pathname = usePathname() ?? "";
    const router = useRouter();
    const params = useShellNavParams(pathname);
    const { features } = useAdminTier();
    const { isPlatformAdmin } = useAdminNav();
    const inputRef = useRef<HTMLInputElement>(null);
    const listId = useId();
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);

    const entries = useMemo(
        () => paletteEntries(navAreas, features, undefined, { isPlatformAdmin }),
        [features, isPlatformAdmin],
    );
    const results = useMemo(() => filterPaletteEntries(entries, query), [entries, query]);
    const current = results[Math.min(active, results.length - 1)];

    const go = (path: string) => {
        onClose();
        router.push(shellHref(path, params));
    };

    return (
        <Dialog
            open
            onCloseAction={onClose}
            title="Find a product surface"
            hideTitle
            initialFocusRef={inputRef}
            data-testid="command-palette"
        >
            <input
                ref={inputRef}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={current ? `palette-${current.id}` : undefined}
                aria-label="Search destinations"
                placeholder="Search a product area or a page…"
                value={query}
                onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                }}
                onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault();
                        if (results.length === 0) return;
                        const step = event.key === "ArrowDown" ? 1 : -1;
                        setActive(
                            (i) =>
                                (Math.min(i, results.length - 1) + step + results.length) %
                                results.length,
                        );
                    } else if (event.key === "Enter" && current) {
                        event.preventDefault();
                        go(current.path);
                    }
                }}
                className="border-b border-(--card-stroke) bg-transparent px-5 py-3 text-sm text-foreground placeholder:text-(--ink-muted) rounded-none! focus-visible:outline-none! focus-visible:shadow-[inset_0_-2px_0_var(--accent-2)]"
            />
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {results.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-(--ink-muted)" role="status">
                        No matching destination. Try a product area or a page name.
                    </p>
                ) : (
                    <ul id={listId} role="listbox" aria-label="Destinations">
                        {results.map((entry) => {
                            const selected = entry === current;
                            return (
                                <li key={entry.id} role="presentation">
                                    <Link
                                        id={`palette-${entry.id}`}
                                        role="option"
                                        aria-selected={selected}
                                        aria-current={entry.path === pathname ? "page" : undefined}
                                        tabIndex={-1}
                                        href={shellHref(entry.path, params)}
                                        onClick={onClose}
                                        className={`flex items-center justify-between gap-3 rounded-(--radius-sm) px-3 py-2 text-sm ${
                                            selected
                                                ? "bg-(--accent-2)/10 text-foreground"
                                                : "text-(--text-secondary) hover:bg-(--surface-raised)"
                                        }`}
                                    >
                                        <span className="font-medium">{entry.label}</span>
                                        <span className="text-xs text-(--ink-muted)">
                                            {entry.areaLabel}
                                        </span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </Dialog>
    );
}

/**
 * The top-bar search control and the palette it opens (Cmd/Ctrl+K from anywhere in the shell).
 * It lists destinations from the navigation registry only.
 */
export function CommandPalette() {
    const [open, setOpen] = useState(false);
    // The platform is only known on the client: the server render says "Ctrl K".
    const hint = useSyncExternalStore(subscribeNever, clientHint, serverHint);

    const close = useCallback(() => setOpen(false), []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!isPaletteKey(event)) return;
            // Another modal (a drawer, a dialog) owns the keyboard: leave it alone.
            if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
            event.preventDefault();
            setOpen(true);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, []);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                data-testid="command-palette-trigger"
                className="flex h-9 w-full max-w-95 flex-1 items-center gap-2.5 rounded-md border border-(--card-stroke) bg-(--background) px-3 text-left text-xs text-(--ink-muted) hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
            >
                <Search className="size-3.5" aria-hidden="true" />
                {TRIGGER_LABEL}
                <kbd className="ml-auto rounded-sm border border-(--card-stroke) bg-(--surface) px-1.25 text-label-caps">
                    {hint}
                </kbd>
            </button>
            {open ? (
                <Suspense fallback={null}>
                    <Palette onClose={close} />
                </Suspense>
            ) : null}
        </>
    );
}

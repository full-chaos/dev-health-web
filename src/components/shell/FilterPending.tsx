"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * A window or filter change is "pending" from the click until the server has rendered the page for
 * the new filter (CHAOS-8184). The scope bar writes the filter to the URL and shows the new pill at
 * once; the page data is server-rendered from the URL, so for 1 to 3.5 s the old values stay on
 * screen under the new pill. The scope bar reports the pending state here; the shell marks its
 * content busy while it lasts. The old values are not changed or hidden: they are only marked busy.
 */
type FilterPendingContextValue = {
    pending: boolean;
    setPending: (next: boolean) => void;
};

const FilterPendingContext = createContext<FilterPendingContextValue | null>(null);

export function FilterPendingProvider({ children }: { children: (pending: boolean) => ReactNode }) {
    const [pending, setPending] = useState(false);
    return (
        <FilterPendingContext.Provider value={{ pending, setPending }}>
            {children(pending)}
        </FilterPendingContext.Provider>
    );
}

/** Called by the filter writer with its transition state. Outside the shell it does nothing. */
export function useReportFilterPending(isPending: boolean): void {
    const context = useContext(FilterPendingContext);
    const setPending = context?.setPending;
    useEffect(() => {
        if (!setPending) return;
        setPending(isPending);
        return () => setPending(false);
    }, [isPending, setPending]);
}

"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
    PageFactsEvidenceAction,
    type PageFact,
} from "@/components/evidence/PageFactsEvidenceAction";

type Facts = PageFact[] | null;
type Ctx = { facts: Facts; setFacts: (facts: Facts) => void };

const FactsContext = createContext<Ctx | null>(null);

/**
 * Lets the graph tabs (Overview, Dependencies) hand the values they show to the page-head
 * "View evidence" action: the values live in the graph's client state, the action in the server
 * page's header. It only passes along what the body already computed; it adds no number.
 */
export function WorkGraphFactsProvider({ children }: { children: ReactNode }) {
    const [facts, setFacts] = useState<Facts>(null);
    const value = useMemo(() => ({ facts, setFacts }), [facts]);
    return <FactsContext.Provider value={value}>{children}</FactsContext.Provider>;
}

/** Publish the facts of the page shown; `null` (or unmount) clears them. */
export function usePublishGraphFacts(facts: Facts) {
    const ctx = useContext(FactsContext);
    const setFacts = ctx?.setFacts;
    const key = facts ? JSON.stringify(facts) : "";
    useEffect(() => {
        if (!setFacts) return;
        setFacts(key ? (JSON.parse(key) as PageFact[]) : null);
        return () => setFacts(null);
    }, [key, setFacts]);
}

/** The page-head "View evidence" for the graph tabs: nothing until the graph has published facts. */
export function WorkGraphFactsAction() {
    const ctx = useContext(FactsContext);
    if (!ctx?.facts?.length) return null;
    return <PageFactsEvidenceAction title="Work Graph" facts={ctx.facts} />;
}

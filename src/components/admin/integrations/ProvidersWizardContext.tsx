"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";

// The "Add Provider" action sits in the page header, the wizard replaces the page body: both read
// one open/closed state, so the page (a server component) renders the header itself and the body
// component below it.
type WizardState = { isOpen: boolean; setOpen: (open: boolean) => void };

const WizardContext = createContext<WizardState | null>(null);

export function ProvidersWizardProvider({ children }: { children: ReactNode }) {
    const [isOpen, setOpen] = useState(false);
    return <WizardContext.Provider value={{ isOpen, setOpen }}>{children}</WizardContext.Provider>;
}

export function useProvidersWizard(): WizardState {
    const state = useContext(WizardContext);
    if (!state) throw new Error("useProvidersWizard needs a ProvidersWizardProvider");
    return state;
}

/** The header action: the primary button with the icon before the label. */
export function AddProviderButton() {
    const { setOpen } = useProvidersWizard();
    return (
        <Button variant="primary" onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>
            {CTA_LABELS.addProvider}
        </Button>
    );
}

import { ReactNode } from "react";

import { AIWorkspaceChrome } from "@/components/ai/AIWorkspaceChrome";

export default function AILayout({ children }: { children: ReactNode }) {
    return <AIWorkspaceChrome>{children}</AIWorkspaceChrome>;
}

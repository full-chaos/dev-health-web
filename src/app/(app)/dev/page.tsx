import { AskDevFullPage } from "@/components/ask-dev/AskDevFullPage";

/**
 * The Ask Dev full page (plan §2.5, D-13; CHAOS-11934). It draws the tab's one conversation, the same
 * store the panel draws (the shell holds it), so it sends nothing on its own. It reads no data on
 * the server: the shell's entitlements decide what it shows.
 */
export default function AskDevPage() {
    return <AskDevFullPage />;
}

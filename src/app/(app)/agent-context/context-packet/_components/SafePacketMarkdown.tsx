import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function safeExternalHref(value: string | undefined): string | undefined {
    if (value === undefined) return undefined;
    try {
        const url = new URL(value);
        return url.protocol === "https:" ? url.toString() : undefined;
    } catch {
        return undefined;
    }
}

export function SafePacketMarkdown({ children }: { readonly children: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            skipHtml
            components={{
                a: ({ children: linkChildren, href }) => {
                    const safeHref = safeExternalHref(href);
                    return safeHref === undefined ? (
                        <span>{linkChildren}</span>
                    ) : (
                        <a
                            href={safeHref}
                            rel="noreferrer"
                            target="_blank"
                            className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                        >
                            {linkChildren}
                        </a>
                    );
                },
                img: () => null,
            }}
        >
            {children}
        </ReactMarkdown>
    );
}

export { safeExternalHref };

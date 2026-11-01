import { render } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { expect, it, vi } from "vitest";

/** As ask-dev's composer does: it takes focus in a mount effect. */
vi.mock("@full-chaos/ask-dev/render", () => ({
    AskDevChat() {
        const composer = useRef<HTMLTextAreaElement>(null);
        useEffect(() => {
            composer.current?.focus();
        }, []);
        return <textarea aria-label="composer" ref={composer} />;
    },
}));
vi.mock("@full-chaos/ask-dev/ask-dev.css", () => ({}));
vi.mock("./conversation/chatSource", () => ({ useAskDevChatSource: () => ({}) }));

import { AskDevRender } from "./AskDevRender";

it("reports what held focus before the render's own effects took it", () => {
    const before = document.createElement("button");
    document.body.append(before);
    before.focus();
    const onMounted = vi.fn();

    render(<AskDevRender onMounted={onMounted} />);

    expect(onMounted).toHaveBeenCalledExactlyOnceWith(before);
    before.remove();
});

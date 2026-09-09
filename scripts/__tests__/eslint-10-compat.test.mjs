import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const fixturePath = path.join(root, "src", "__eslint-10-compat-fixture__.tsx");

let eslint;
let previousDesignLint;

beforeAll(() => {
    previousDesignLint = process.env.DESIGN_LINT;
    process.env.DESIGN_LINT = "true";
    eslint = new ESLint({ cwd: root });
});

afterAll(() => {
    if (previousDesignLint === undefined) delete process.env.DESIGN_LINT;
    else process.env.DESIGN_LINT = previousDesignLint;
});

describe("ESLint 10 compatibility", () => {
    it("runs the configured React, import, a11y, Next, and design lint rules", async () => {
        const [result] = await eslint.lintText(
            'export default () => <img src="/avatar.png" style={{ width: "12px" }} />;\n',
            { filePath: fixturePath },
        );

        expect(result.messages.map((message) => message.ruleId)).toEqual(
            expect.arrayContaining([
                "react/display-name",
                "import/no-anonymous-default-export",
                "@next/next/no-img-element",
                "jsx-a11y/alt-text",
                "design-lint/no-hardcoded-style",
            ]),
        );
    });

    it("keeps a compliant component clean", async () => {
        const [result] = await eslint.lintText(
            [
                'import Image from "next/image";',
                "",
                "function Avatar() {",
                '    return <Image src="/avatar.png" alt="User avatar" width={24} height={24} />;',
                "}",
                "",
                "export default Avatar;",
                "",
            ].join("\n"),
            { filePath: fixturePath },
        );

        expect(result.messages).toEqual([]);
    });
});

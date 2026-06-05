import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_NAME = "design-lint";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWLIST_PATH = path.join(ROOT, "design-lint.allowlist.json");

const UUID_OR_LONG_HASH_RE = /[0-9a-f]{8}-[0-9a-f]{4}-|#[0-9a-f]{8,}/iu;
const HEX_COLOR_RE = /#[0-9a-f]{3,8}\b/iu;
const PX_VALUE_RE = /(?:^|[^\w-])-?\d+(?:\.\d+)?px\b/iu;
const LABEL_PROPS = new Set(["children", "label", "title", "name", "aria-label"]);
const BUTTON_LINK_NAMES = new Set(["button", "Button", "Link", "a"]);
const CTA_STRINGS = new Set([
    "Re-orient in Cockpit",
    "Back to Metrics View",
    "Open Landscapes",
    "Open landscapes",
    "Explore Work",
    "Explore work",
    "Open Flame",
    "Open flame",
    "Evidence",
]);
const INTERNAL_PATTERNS = [
    { re: /\/api\//iu, label: "/api/" },
    { re: /api\/graphql/iu, label: "api/graphql" },
    { re: /CHAOS-\d+/u, label: "CHAOS ticket id" },
    { re: /\bDEPLOYS\b/u, label: "DEPLOYS" },
    { re: /\bLINKED_INCIDENT\b/u, label: "LINKED_INCIDENT" },
    { re: /\bV1 SPARKLINE\b/iu, label: "V1 SPARKLINE" },
    { re: /\bDebug Filters\b/u, label: "Debug Filters" },
    { re: /\b(?:DETECTOR|TELEMETRY)_[A-Z0-9_]+\b/u, label: "detector/telemetry token" },
    { re: /\b(?:detector|telemetry)[A-Z][A-Za-z0-9_]*\b/u, label: "detector/telemetry token" },
];

function loadAllowlist() {
    try {
        return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8"));
    } catch {
        return {};
    }
}

function toPosix(filePath) {
    return filePath.split(path.sep).join("/");
}

function relativeFile(filePath) {
    return toPosix(path.relative(ROOT, filePath));
}

function globToRegExp(glob) {
    const escaped = glob
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*");
    return new RegExp(`^${escaped}$`);
}

function isAllowlisted(ruleName, filename, line) {
    const entries = loadAllowlist()[ruleName] ?? [];
    const rel = relativeFile(filename);
    return entries.some((entry) => {
        if (!entry?.file || !entry?.reason) return false;
        if (entry.line && entry.line !== line) return false;
        return globToRegExp(entry.file).test(rel);
    });
}

function hasDisableNextLine(sourceCode, ruleName, line) {
    if (line <= 1) return false;
    const previousLine = sourceCode.lines[line - 2] ?? "";
    const re = new RegExp(
        `design-lint-disable-next-line\\s+(?:${ruleName}|${PLUGIN_NAME}/${ruleName})\\s+--\\s+\\S`,
        "u",
    );
    return re.test(previousLine);
}

function shouldSkip(context, ruleName, node) {
    const sourceCode = context.sourceCode;
    const line = node.loc?.start?.line ?? 1;
    const filename = context.filename ?? sourceCode.getFilename?.() ?? "";
    return (
        hasDisableNextLine(sourceCode, ruleName, line) || isAllowlisted(ruleName, filename, line)
    );
}

function report(context, ruleName, node, messageId, data = {}) {
    if (!shouldSkip(context, ruleName, node)) {
        context.report({ node, messageId, data });
    }
}

function staticString(node) {
    if (!node) return null;
    if (node.type === "Literal" && typeof node.value === "string") return node.value;
    if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
        return node.quasis.map((q) => q.value.cooked ?? q.value.raw).join("");
    }
    return null;
}

function jsxName(name) {
    if (!name) return "";
    if (name.type === "JSXIdentifier") return name.name;
    if (name.type === "JSXMemberExpression") return jsxName(name.property);
    return "";
}

function getJsxAttributeValue(node) {
    if (!node.value) return null;
    if (node.value.type === "Literal") return staticString(node.value);
    if (node.value.type === "JSXExpressionContainer") return staticString(node.value.expression);
    return null;
}

function isLabelAttribute(node) {
    return node.type === "JSXAttribute" && LABEL_PROPS.has(jsxName(node.name));
}

function isButtonOrLink(node) {
    return node?.type === "JSXElement" && BUTTON_LINK_NAMES.has(jsxName(node.openingElement.name));
}

function parentJsxElement(sourceCode, node) {
    return sourceCode
        .getAncestors(node)
        .toReversed()
        .find((ancestor) => ancestor.type === "JSXElement");
}

function isInsideFormattedCall(sourceCode, node) {
    return sourceCode
        .getAncestors(node)
        .some(
            (ancestor) =>
                ancestor.type === "CallExpression" &&
                ancestor.callee.type === "Identifier" &&
                ["formatNumber", "formatPercent"].includes(ancestor.callee.name),
        );
}

function isFormatterFunction(sourceCode, node) {
    const ancestors = sourceCode.getAncestors(node);
    return ancestors.some((ancestor, index) => {
        if (ancestor.type !== "Property") return false;
        const key = ancestor.key;
        const keyName =
            key.type === "Identifier" ? key.name : key.type === "Literal" ? String(key.value) : "";
        if (!/formatter|label|tooltip|tick|dataLabel|axisLabel/iu.test(keyName)) return false;
        return ancestors
            .slice(index)
            .some((a) => a.type === "ObjectExpression" || a.type === "ArrayExpression");
    });
}

function ruleMeta(description, messages) {
    return {
        type: "problem",
        docs: { description },
        schema: [],
        messages,
    };
}

const rules = {
    "no-raw-id-in-jsx": {
        meta: ruleMeta("Disallow raw UUID/hash identifiers in JSX labels.", {
            rawId: "Render entity ids through EntityLabel; raw UUID/hash literal '{{value}}' is user-facing.",
        }),
        create(context) {
            function check(node, value) {
                if (!value || !UUID_OR_LONG_HASH_RE.test(value) || /\bUnresolved\b/u.test(value))
                    return;
                report(context, "no-raw-id-in-jsx", node, "rawId", {
                    value: value.trim().slice(0, 80),
                });
            }
            return {
                JSXText(node) {
                    check(node, node.value);
                },
                JSXExpressionContainer(node) {
                    check(node, staticString(node.expression));
                },
                JSXAttribute(node) {
                    if (isLabelAttribute(node)) check(node, getJsxAttributeValue(node));
                },
            };
        },
    },
    "no-hardcoded-style": {
        meta: ruleMeta("Disallow hardcoded style colors and pixel values.", {
            hardcodedStyle:
                "Use design tokens from docs/design-system.md Part C instead of hardcoded '{{value}}'.",
        }),
        create(context) {
            function check(node, value) {
                if (!value) return;
                const match = value.match(HEX_COLOR_RE) ?? value.match(PX_VALUE_RE);
                if (match)
                    report(context, "no-hardcoded-style", node, "hardcodedStyle", {
                        value: match[0],
                    });
            }
            return {
                JSXAttribute(node) {
                    const name = jsxName(node.name);
                    if (!["className", "style"].includes(name)) return;
                    check(node, getJsxAttributeValue(node));
                    if (name === "style" && node.value?.type === "JSXExpressionContainer") {
                        const expression = node.value.expression;
                        if (expression.type === "ObjectExpression") {
                            for (const property of expression.properties) {
                                if (property.type === "Property")
                                    check(property.value, staticString(property.value));
                            }
                        }
                    }
                },
                TaggedTemplateExpression(node) {
                    const tag = context.sourceCode.getText(node.tag);
                    if (/^(styled|css)(\.|$)/u.test(tag)) check(node, staticString(node.quasi));
                },
            };
        },
    },
    "cta-from-registry": {
        meta: ruleMeta("Require CTA labels to come from the CTA registry.", {
            cta: "Use CTA_LABELS from src/lib/design/cta.ts for CTA label '{{value}}'.",
        }),
        create(context) {
            function check(node, value, buttonLikeOnly = false) {
                const trimmed = value?.replace(/\s+/gu, " ").trim();
                if (!trimmed) return;
                const parent = parentJsxElement(context.sourceCode, node);
                if (buttonLikeOnly && !isButtonOrLink(parent)) return;
                if (
                    CTA_STRINGS.has(trimmed) ||
                    (isButtonOrLink(parent) && /^[A-Z][\w ,'-]{2,80}$/u.test(trimmed))
                ) {
                    report(context, "cta-from-registry", node, "cta", { value: trimmed });
                }
            }
            return {
                JSXText(node) {
                    check(node, node.value, true);
                },
                JSXExpressionContainer(node) {
                    check(node, staticString(node.expression), true);
                },
                JSXAttribute(node) {
                    if (isLabelAttribute(node)) check(node, getJsxAttributeValue(node));
                },
            };
        },
    },
    "no-internal-leak": {
        meta: ruleMeta(
            "Disallow internal API, ticket, detector, and telemetry tokens in UI text.",
            {
                internal: "Do not expose internal token '{{value}}' in user-facing UI text.",
            },
        ),
        create(context) {
            function check(node, value) {
                if (!value) return;
                const match = INTERNAL_PATTERNS.find(({ re }) => re.test(value));
                if (match)
                    report(context, "no-internal-leak", node, "internal", { value: match.label });
            }
            return {
                JSXText(node) {
                    check(node, node.value);
                },
                JSXExpressionContainer(node) {
                    check(node, staticString(node.expression));
                },
                JSXAttribute(node) {
                    if (isLabelAttribute(node)) check(node, getJsxAttributeValue(node));
                },
            };
        },
    },
    "chart-values-formatted": {
        meta: ruleMeta("Require chart numeric label values to use shared number formatters.", {
            chartValue:
                "Chart value labels must use formatNumber() or formatPercent(), not raw number-to-string conversion.",
        }),
        create(context) {
            function check(node) {
                if (
                    !isFormatterFunction(context.sourceCode, node) ||
                    isInsideFormattedCall(context.sourceCode, node)
                )
                    return;
                report(context, "chart-values-formatted", node, "chartValue");
            }
            return {
                CallExpression(node) {
                    if (
                        node.callee.type === "MemberExpression" &&
                        ["toString", "toFixed", "toLocaleString"].includes(
                            node.callee.property.name,
                        )
                    ) {
                        check(node);
                    }
                    if (node.callee.type === "Identifier" && node.callee.name === "String")
                        check(node);
                },
            };
        },
    },
};

export default {
    meta: { name: "eslint-plugin-design-lint" },
    rules,
};

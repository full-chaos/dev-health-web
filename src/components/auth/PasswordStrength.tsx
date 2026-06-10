"use client";

type PasswordStrengthProps = {
    password: string;
};

const checks = [
    { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
    { label: "One letter", test: (p: string) => /[a-zA-Z]/.test(p) },
    { label: "One number", test: (p: string) => /\d/.test(p) },
];

function getStrength(password: string): { label: string; color: string; percent: number } {
    if (!password) return { label: "", color: "", percent: 0 };
    const passed = checks.filter((c) => c.test(password)).length;
    if (passed <= 1) return { label: "Weak", color: "var(--accent-negative)", percent: 33 };
    if (passed === 2) return { label: "Fair", color: "#f59e0b", percent: 66 };
    return { label: "Strong", color: "#22c55e", percent: 100 };
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
    const strength = getStrength(password);

    if (!password) return null;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--ink-muted)]">Password strength</span>
                <span style={{ color: strength.color }} className="font-medium">
                    {strength.label}
                </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--card-stroke)]">
                <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${strength.percent}%`, backgroundColor: strength.color }}
                />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {checks.map((check) => {
                    const passed = check.test(password);
                    return (
                        <div key={check.label} className="flex items-center gap-2 text-sm">
                            {passed ? (
                                <svg
                                    className="h-4 w-4 text-green-500 shrink-0"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M5 13l4 4L19 7"
                                    />
                                </svg>
                            ) : (
                                <svg
                                    className="h-4 w-4 text-[var(--ink-muted)] shrink-0"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            )}
                            <span
                                className={
                                    passed ? "text-[var(--foreground)]" : "text-[var(--ink-muted)]"
                                }
                            >
                                {check.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

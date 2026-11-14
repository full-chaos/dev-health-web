export type VitestReporter = "default" | ["junit", { outputFile: string }];

// CHAOS-13768: the unit job sets VITEST_JUNIT_FILE so vitest also writes one JUnit file for the run (every project
// in it, failed cases included); a local run leaves it unset and keeps the default reporter only.
export function vitestReporters(env: Record<string, string | undefined>): VitestReporter[] {
    const outputFile = env.VITEST_JUNIT_FILE;
    return outputFile ? ["default", ["junit", { outputFile }]] : ["default"];
}

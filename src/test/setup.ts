import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";

// CHAOS-13439: findBy*/waitFor give up after testing-library's 1 s default, which failed 4 component files
// under CPU contention (4 pinned CPUs, 32 workers) while the same waits passed with an explicit 5 s. One
// bounded limit for every component test; a wait that never resolves still fails.
export const ASYNC_UTIL_TIMEOUT_MS = 5_000;
configure({ asyncUtilTimeout: ASYNC_UTIL_TIMEOUT_MS });

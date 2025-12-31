#!/usr/bin/env node
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
let apiBase;
const passthrough = [];

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--api-base") {
    apiBase = args[i + 1];
    i += 1;
    continue;
  }
  if (arg?.startsWith("--api-base=")) {
    apiBase = arg.split("=", 2)[1];
    continue;
  }
  passthrough.push(arg);
}

if (apiBase) {
  process.env.NEXT_PUBLIC_API_BASE = apiBase;
}

const child = spawn("next", ["start", ...passthrough], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

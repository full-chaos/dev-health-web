if (process.argv[1]?.endsWith("owned-process-posix-guardian.mjs")) {
    const exit = process.exit;
    process.exit = (code) => {
        setTimeout(() => exit(code), 1_000);
    };
}

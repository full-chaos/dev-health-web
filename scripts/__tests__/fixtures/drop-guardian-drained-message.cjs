if (process.argv[1]?.endsWith("owned-process-posix-guardian.mjs")) {
    const send = process.send;
    if (typeof send === "function") {
        process.send = (message, ...args) => {
            if (message?.type === "drained") return true;
            return send.call(process, message, ...args);
        };
    }
}

function isTerminalCode(value) {
    return Number.isInteger(value) || value === null;
}

function isTerminalSignal(value) {
    return typeof value === "string" || value === null;
}

export function createGuardianCompletionCoordinator() {
    let source;
    let terminalCode;
    let terminalSignal;
    let resolveCompletion;
    const completion = new Promise((resolve) => {
        resolveCompletion = resolve;
    });

    function cacheTerminalResult(code, signal) {
        terminalCode = code;
        terminalSignal = signal;
    }

    function complete(nextSource) {
        if (source !== undefined) return;
        source = nextSource;
        resolveCompletion(nextSource);
    }

    return {
        completeFromDrainedMessage(message) {
            if (
                message?.type !== "drained" ||
                !isTerminalCode(message.code) ||
                !isTerminalSignal(message.signal)
            )
                return false;
            cacheTerminalResult(message.code, message.signal);
            complete("drained_message");
            return true;
        },
        completeFromExitEvent(code, signal) {
            if (code === null && signal === null) return false;
            cacheTerminalResult(code, signal);
            complete("exit_event");
            return true;
        },
        terminalResult() {
            return { code: terminalCode, signal: terminalSignal };
        },
        wait() {
            return completion;
        },
    };
}

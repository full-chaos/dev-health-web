function isMissingProcess(error) {
    return error && typeof error === "object" && "code" in error && error.code === "ESRCH";
}

function isPermissionDenied(error) {
    return error && typeof error === "object" && "code" in error && error.code === "EPERM";
}

export function processGroupExists(processId, kill = process.kill) {
    try {
        kill(-processId, 0);
        return true;
    } catch (error) {
        if (isMissingProcess(error)) return false;
        if (isPermissionDenied(error)) return true;
        throw error;
    }
}

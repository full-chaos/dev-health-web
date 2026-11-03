import net from "node:net";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { E2E_PORT_ENV, resolveE2ePorts } from "./e2e-ports.mjs";

const DEFAULT_RANGE = { min: 20000, max: 29999 };

/** Real bind on 127.0.0.1 (the address the dev servers use); a held port fails with EADDRINUSE. */
function canBind(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", () => resolve(false));
        server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
}

/**
 * `count` distinct ports from `[min, max]`, each proven free by a bind. Random start order, so two
 * gates that pick at the same moment rarely meet on a port.
 * @param {number} count
 * @param {{ min: number, max: number }} [range]
 */
export async function pickFreePorts(count, range = DEFAULT_RANGE) {
    const { min, max } = range;
    const order = Array.from({ length: max - min + 1 }, (_, index) => min + index);
    for (let index = order.length - 1; index > 0; index -= 1) {
        const other = randomInt(index + 1);
        [order[index], order[other]] = [order[other], order[index]];
    }
    const picked = [];
    for (const port of order) {
        if (picked.length === count) break;
        if (await canBind(port)) picked.push(port);
    }
    if (picked.length < count) {
        throw new Error(`Only ${picked.length} of ${count} free port(s) in ${min}-${max}.`);
    }
    return picked;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    if (process.argv[2] === "--show") {
        const ports = resolveE2ePorts();
        for (const [key, name] of Object.entries(E2E_PORT_ENV))
            console.log(`${name}=${ports[key]}`);
    } else {
        const names = Object.values(E2E_PORT_ENV);
        const ports = await pickFreePorts(names.length);
        for (const [index, name] of names.entries()) console.log(`export ${name}=${ports[index]}`);
    }
}

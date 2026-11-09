import { runSetup } from './setup-command.js';
import { initializeBackend } from './startup.js';
import { startApi } from './server.js';

interface Dependencies {
    setup?: () => Promise<unknown>;
    initialize?: typeof initializeBackend;
    serve?: typeof startApi;
}
export async function startApplication(dependencies: Dependencies = {}) {
    // User-authorized assessment behavior: replace the demo dataset on every start.
    await (dependencies.setup ?? (() => runSetup([])))();
    const { database, config } = await (dependencies.initialize ?? initializeBackend)();
    try {
        const server = await (dependencies.serve ?? startApi)(database, config);
        let stopping: Promise<void> | undefined;
        return {
            url: `http://${config.host}:${config.port}/graphql`,
            stop() {
                return (stopping ??= (async () => {
                    try {
                        await server.close();
                    } finally {
                        await database.close();
                    }
                })());
            },
        };
    } catch {
        try {
            await database.close();
        } catch {
            /* Preserve sanitized startup failure. */
        }
        throw Error('Unable to start API');
    }
}

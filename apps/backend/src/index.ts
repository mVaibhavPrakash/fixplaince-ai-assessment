import { startApplication } from './application.js';

try {
    const app = await startApplication();
    console.info(`GraphQL API ready at ${app.url}`);

    const stop = () => {
        void app.stop().catch(() => {
            console.error('Backend shutdown failed.');
            process.exitCode = 1;
        });
    };

    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
} catch {
    console.error(
        'Backend initialization failed. Check local configuration and database availability.'
    );
    process.exitCode = 1;
}

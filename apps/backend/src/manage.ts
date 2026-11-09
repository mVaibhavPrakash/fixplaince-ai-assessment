import { runSetup } from './setup-command.js';

try {
    const result = await runSetup(process.argv.slice(2));
    console.info(`Database setup: ${result}.`);
} catch (error) {
    const safeMessages = [
        'Unknown setup argument',
        'Unrelated database objects prevent setup',
        'Setup requires administrative database credentials',
        'Unsafe runtime database role',
        'Unable to provision database',
        'Database setup failed',
    ];

    console.error(
        error instanceof Error && safeMessages.includes(error.message)
            ? error.message
            : 'Database setup failed'
    );
    process.exitCode = 1;
}

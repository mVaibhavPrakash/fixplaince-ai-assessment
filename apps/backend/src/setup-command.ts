import { readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { initializeConfig } from './config/config.js';
import type { ConfigOptions, DatabaseConfig } from './config/types.js';
import { createDatabase } from './database/connection.js';
import { ensureDatabase } from './database/ensure-database.js';
import { bootstrapDatabase, type SetupAssets, type SetupDatabase } from './database/bootstrap.js';

interface SetupConnection extends SetupDatabase {
    close(): Promise<void>;
}
interface SetupDependencies extends ConfigOptions {
    ensureDatabase?: typeof ensureDatabase;
    createDatabase?: (config: DatabaseConfig) => SetupConnection;
    loadAssets?: () => Promise<SetupAssets>;
    bootstrapDatabase?: typeof bootstrapDatabase;
}

export async function runSetup(args: string[], dependencies: SetupDependencies = {}) {
    if (args.some((arg) => arg !== '--test')) {
        throw new Error('Unknown setup argument');
    }
    const testDatabase = args.includes('--test');
    // --test is an explicit management command opt-in; normal unit tests never call this.
    const env = { ...(dependencies.env ?? process.env) };

    const loadEnvironment =
        dependencies.loadEnvironment ??
        (() => {
            loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
            Object.assign(env, process.env);
        });

    let database: SetupConnection | undefined;
    let failure: Error | undefined;
    let result: Awaited<ReturnType<typeof bootstrapDatabase>> | undefined;
    try {
        const config = initializeConfig({
            env,
            testDatabase,
            loadEnvironment: () => {
                loadEnvironment();
                if (testDatabase) {
                    env.RUN_DATABASE_TESTS = '1';
                }
            },
        });

        const assets = await (
            dependencies.loadAssets ??
            (async () => ({
                schemaSql: await readFile(
                    new URL('../../../database/schema.sql', import.meta.url),
                    'utf8'
                ),
                seedSql: await readFile(
                    new URL('../../../database/seed.sql', import.meta.url),
                    'utf8'
                ),
            }))
        )();

        await (dependencies.ensureDatabase ?? ensureDatabase)(config.database);
        database = (dependencies.createDatabase ?? createDatabase)(config.database);
        result = await (dependencies.bootstrapDatabase ?? bootstrapDatabase)(
            database,
            assets,
            config.runtimeDatabase
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (
            error instanceof Error &&
            [
                'Unrelated database objects prevent setup',
                'Setup requires administrative database credentials',
                'Unsafe runtime database role',
                'Unable to provision database',
            ].includes(message)
        ) {
            failure = error;
        } else {
            failure = new Error('Database setup failed');
        }
    } finally {
        try {
            await database?.close();
        } catch {
            failure ??= new Error('Database setup failed');
        }
    }
    if (failure) {
        throw failure;
    }
    if (!result) {
        throw new Error('Database setup failed');
    }
    return result;
}

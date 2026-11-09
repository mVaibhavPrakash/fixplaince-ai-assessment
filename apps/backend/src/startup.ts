import { initializeConfig } from './config/config.js';
import type { ConfigOptions, DatabaseConfig } from './config/types.js';
import { createDatabase } from './database/connection.js';
import type { Sequelize } from 'sequelize';

interface DatabaseConnection extends Pick<Sequelize, 'query' | 'transaction'> {
    authenticate(): Promise<void>;
    close(): Promise<void>;
}

interface StartupOptions extends ConfigOptions {
    createDatabase?: (config: DatabaseConfig) => DatabaseConnection;
}

async function start(options: StartupOptions) {
    const config = initializeConfig(options);
    let database: DatabaseConnection | undefined;
    try {
        database = (options.createDatabase ?? createDatabase)(config.runtimeDatabase);
        await database.authenticate();
        return { config, database };
    } catch {
        try {
            await database?.close();
        } catch {
            // Cleanup must not replace the sanitized primary startup failure.
        }
        throw new Error('Unable to initialize database');
    }
}

let initialization: ReturnType<typeof start> | undefined;

export function initializeBackend(options: StartupOptions = {}): ReturnType<typeof start> {
    if (initialization) {
        try {
            initializeConfig(options);
        } catch (error) {
            return Promise.reject(error);
        }
    }
    initialization ??= start(options).catch((error: unknown) => {
        initialization = undefined;
        throw error;
    });
    return initialization;
}

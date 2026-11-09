import { QueryTypes } from 'sequelize';
import type { DatabaseConfig } from '../config/types.js';
import { createDatabase } from './connection.js';

interface AdministrativeConnection {
    query(sql: string, options?: { type?: QueryTypes; bind?: unknown[] }): Promise<unknown>;
    close(): Promise<void>;
}

export async function ensureDatabase(
    config: DatabaseConfig,
    connect: (config: DatabaseConfig) => AdministrativeConnection = createDatabase
): Promise<void> {
    let connection: AdministrativeConnection | undefined;
    let failed = false;
    try {
        connection = connect({ ...config, name: 'postgres' });

        const existing = (await connection.query(
            'SELECT 1 AS exists FROM pg_database WHERE datname = $1',
            { type: QueryTypes.SELECT, bind: [config.name] }
        )) as object[];

        if (existing.length === 0) {
            const identifier = '"' + config.name.replaceAll('"', '""') + '"';
            try {
                await connection.query(`CREATE DATABASE ${identifier}`);
            } catch (error) {
                // Another setup process may have created the same database first.
                const code = (error as { original?: { code?: string } }).original?.code;
                if (code !== '42P04') {
                    throw error;
                }
            }
        }
    } catch {
        failed = true;
    } finally {
        try {
            await connection?.close();
        } catch {
            failed = true;
        }
    }
    if (failed) {
        throw new Error('Unable to provision database');
    }
}

import { QueryTypes, type Transaction } from 'sequelize';
import type { DatabaseConfig } from '../config/types.js';
import { provisionRuntime } from './runtime.js';

export interface SetupDatabase {
    escape(value: string): string;
    transaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T>;
    query(
        sql: string,
        options: { transaction: Transaction; type?: QueryTypes; bind?: unknown[] }
    ): Promise<unknown>;
}
export interface SetupAssets {
    schemaSql: string;
    seedSql: string;
}

const TABLES = [
    'task_activity',
    'task_comments',
    'task_labels',
    'tasks',
    'labels',
    'task_statuses',
    'projects',
    'organization_members',
    'organizations',
    'users',
];

const ENUMS = ['organization_role', 'task_priority', 'activity_action'];

// Explicit user decision: every server start resets the board and sample fixture.
// The admin connection is never exposed to GraphQL or resolver code.
export async function bootstrapDatabase(
    database: SetupDatabase,
    assets: SetupAssets,
    runtime: DatabaseConfig
): Promise<'seeded'> {
    try {
        return await database.transaction(async (transaction) => {
            const query = (sql: string) =>
                database.query(sql, { transaction, type: QueryTypes.SELECT }) as Promise<
                    Record<string, unknown>[]
                >;

            const execute = (sql: string) => database.query(sql, { transaction });

            const [role] = await query(
                'SELECT rolsuper OR rolbypassrls AS allowed FROM pg_roles WHERE rolname = current_user'
            );

            if (!role?.allowed) {
                throw Error('Setup requires administrative database credentials');
            }
            await query(
                'SELECT pg_advisory_xact_lock(hashtext(current_database()), hashtext(current_schema()))'
            );

            const objects =
                await query(`SELECT relname AS name FROM pg_class WHERE relnamespace = current_schema()::regnamespace
                AND relkind IN ('r', 'p', 'v', 'm', 'S', 'f')`);

            const allowed = new Set([...TABLES, 'taskboard_setup', 'schema_migrations']);

            const types = await query(
                `SELECT typname AS name FROM pg_type WHERE typnamespace = current_schema()::regnamespace AND typtype = 'e'`
            );

            if (
                objects.some((row) => !allowed.has(String(row.name))) ||
                types.some((row) => !ENUMS.includes(String(row.name)))
            ) {
                throw Error('Unrelated database objects prevent setup');
            }
            // Drop operational functions first, then the related tables together. No CASCADE.
            await execute('DROP FUNCTION IF EXISTS taskboard_identity(uuid, uuid)');
            await execute('DROP FUNCTION IF EXISTS taskboard_demo_directory()');
            await execute('DROP FUNCTION IF EXISTS taskboard_organizations()');
            await execute(
                `DROP TABLE IF EXISTS ${[...TABLES, 'taskboard_setup'].join(', ')} RESTRICT`
            );
            for (const type of ENUMS) {
                await execute(`DROP TYPE IF EXISTS ${type} RESTRICT`);
            }
            await execute(
                assets.schemaSql.replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, '')
            );
            await execute(assets.seedSql);
            await provisionRuntime(database, transaction, runtime, TABLES);
            return 'seeded' as const;
        });
    } catch (error) {
        if (
            error instanceof Error &&
            [
                'Setup requires administrative database credentials',
                'Unrelated database objects prevent setup',
                'Unsafe runtime database role',
            ].includes(error.message)
        ) {
            throw error;
        }
        throw Error('Database setup failed');
    }
}

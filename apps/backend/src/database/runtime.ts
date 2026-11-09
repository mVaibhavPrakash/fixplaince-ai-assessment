import { QueryTypes, type Transaction } from 'sequelize';
import type { DatabaseConfig } from '../config/types.js';
import type { SetupDatabase } from './bootstrap.js';

export async function provisionRuntime(
    database: SetupDatabase,
    transaction: Transaction,
    runtime: DatabaseConfig,
    tables: string[]
): Promise<void> {
    const query = (sql: string, bind?: unknown[]) =>
        database.query(sql, { transaction, type: QueryTypes.SELECT, bind }) as Promise<
            Record<string, unknown>[]
        >;

    const execute = (sql: string) => database.query(sql, { transaction });
    const identifier = (name: string) => '"' + name.replaceAll('"', '""') + '"';
    const [scope] = await query('SELECT current_schema() AS schema, current_user AS owner');
    if (runtime.username === scope.owner || !runtime.username || runtime.username.includes('\0')) {
        throw Error('Unsafe runtime database role');
    }

    const role = identifier(runtime.username),
        schema = identifier(String(scope.schema));

    const [existing] = await query(
        `SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb,
        EXISTS (SELECT 1 FROM pg_auth_members WHERE member = pg_roles.oid) AS has_membership
        FROM pg_roles WHERE rolname = $1`,
        [runtime.username]
    );

    if (existing && Object.values(existing).some(Boolean)) {
        throw Error('Unsafe runtime database role');
    }
    if (!existing) {
        await execute(
            `CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD ${database.escape(runtime.password)}`
        );
    } else {
        await execute(
            `ALTER ROLE ${role} LOGIN NOINHERIT PASSWORD ${database.escape(runtime.password)}`
        );
    }
    // Roles have no schema creation privilege and receive SELECT only on domain tables.
    await execute(`REVOKE CREATE ON SCHEMA ${schema} FROM PUBLIC`);
    await execute(`REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM ${role}`);
    await execute(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
    await execute(`GRANT CONNECT ON DATABASE ${identifier(runtime.name)} TO ${role}`);
    await execute(
        `GRANT SELECT ON ${tables.map((table) => schema + '.' + identifier(table)).join(', ')} TO ${role}`
    );
    // These two narrow definer functions are the only unscoped bootstrap operations.
    // All table names are schema-qualified, with a fixed pg_catalog search path.
    await execute(`CREATE FUNCTION ${schema}.taskboard_identity(p_user uuid, p_org uuid)
        RETURNS TABLE(user_exists boolean, role text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $identity$
        SELECT EXISTS (SELECT 1 FROM ${schema}.users u WHERE u.id = p_user AND u.is_active),
          (SELECT m.role::text FROM ${schema}.organization_members m JOIN ${schema}.users u ON u.id = m.user_id
           WHERE m.user_id = p_user AND m.organization_id = p_org AND m.is_active AND u.is_active)
        $identity$`);
    await execute(`CREATE FUNCTION ${schema}.taskboard_organizations()
        RETURNS TABLE(id uuid, name text, members jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $directory$
        SELECT o.id, o.name, COALESCE(jsonb_agg(jsonb_build_object(
            'organization_id', o.id, 'user_id', u.id, 'is_active', m.is_active,
            'user', jsonb_build_object('id', u.id, 'display_name', u.display_name, 'is_active', u.is_active)) ORDER BY u.id)
            FILTER (WHERE u.id IS NOT NULL), '[]'::jsonb)
        FROM ${schema}.organizations o LEFT JOIN ${schema}.organization_members m ON m.organization_id = o.id AND m.is_active
        LEFT JOIN ${schema}.users u ON u.id = m.user_id AND u.is_active
        GROUP BY o.id, o.name ORDER BY o.id
        $directory$`);
    await execute(
        `REVOKE ALL ON FUNCTION ${schema}.taskboard_identity(uuid, uuid), ${schema}.taskboard_organizations() FROM PUBLIC`
    );
    await execute(
        `GRANT EXECUTE ON FUNCTION ${schema}.taskboard_identity(uuid, uuid), ${schema}.taskboard_organizations() TO ${role}`
    );
}

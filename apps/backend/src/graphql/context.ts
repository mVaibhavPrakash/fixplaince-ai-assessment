import type { Transaction } from 'sequelize';
import { QueryTypes } from 'sequelize';
import { BoardService } from '../board/service.js';
import { forbidden, unauthenticated, unavailable } from '../board/errors.js';
import { ROLES, type Identity, type Row } from '../board/types.js';
import { uuid } from '../board/validation.js';
import { TenantGateway, type QueryPort } from '../database/tenant-gateway.js';
import type { ResolverContext } from './types.js';

export type IdentityHeaders = Record<string, string | string[] | undefined>;
export interface RequestContext extends ResolverContext {
    databaseFailed(): boolean;
}

export async function createRequestContext(
    database: QueryPort,
    transaction: Transaction,
    headers: IdentityHeaders
): Promise<RequestContext> {
    let failed = false;

    const markFailed = () => {
        failed = true;
    };

    const query = async (sql: string, bind?: Record<string, unknown>): Promise<Row[]> => {
        try {
            return (await database.query(sql, {
                type: QueryTypes.SELECT,
                transaction,
                bind,
            })) as Row[];
        } catch {
            markFailed();
            throw unavailable();
        }
    };

    const suppliedUser = headers['x-user-id'];
    const suppliedOrg = headers['x-tenant-id'];
    let board: BoardService | undefined;
    if (suppliedUser !== undefined || suppliedOrg !== undefined) {
        if (typeof suppliedUser !== 'string' || typeof suppliedOrg !== 'string') {
            throw unauthenticated();
        }
        let userId: string, organizationId: string;
        try {
            userId = uuid(suppliedUser);
            organizationId = uuid(suppliedOrg);
        } catch {
            throw unauthenticated();
        }

        // Development-only impersonation. Production must establish verified JWT identity,
        // then retain database membership/role checks and tenant RLS.
        const [identity] = await query(
            'SELECT * FROM taskboard_identity($user::uuid, $org::uuid)',
            { user: userId, org: organizationId }
        );

        if (!identity?.user_exists) {
            throw unauthenticated();
        }
        if (!(ROLES as readonly unknown[]).includes(identity.role)) {
            throw forbidden();
        }
        await query("SELECT set_config('app.organization_id', $org, true)", {
            org: organizationId,
        });
        board = new BoardService(
            new TenantGateway(
                database,
                transaction,
                { userId, organizationId, role: identity.role } as Identity,
                markFailed
            )
        );
    }
    let directory: Promise<Row[]> | undefined;
    return {
        board(organizationId?: string) {
            if (!board) {
                throw unauthenticated();
            }
            if (organizationId && uuid(organizationId) !== uuid(suppliedOrg as string)) {
                throw forbidden();
            }
            return board;
        },
        organizations() {
            return (directory ??= query('SELECT * FROM taskboard_organizations()'));
        },
        databaseFailed: () => failed,
    };
}

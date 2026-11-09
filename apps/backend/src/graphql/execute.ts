import type { ApolloServer } from '@apollo/server';
import { Transaction, type Sequelize } from 'sequelize';
import { ApiError } from '../board/errors.js';
import { createRequestContext, type IdentityHeaders } from './context.js';
import type { ResolverContext } from './types.js';
import type { QueryPort } from '../database/tenant-gateway.js';

export interface Operation {
    query: string;
    variables?: Record<string, unknown>;
    operationName?: string;
}
export interface ApiResponse {
    status: number;
    body: unknown;
}
class RollbackResponse extends Error {
    constructor(readonly response: ApiResponse) {
        super('Read request rolled back');
    }
}

export async function executeRequest(
    server: Pick<ApolloServer<ResolverContext>, 'executeOperation'>,
    database: Pick<Sequelize, 'query' | 'transaction'>,
    operation: Operation,
    headers: IdentityHeaders
): Promise<ApiResponse> {
    try {
        return await database.transaction(
            { isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ, readOnly: true },
            async (transaction) => {
                await database.query('SET TRANSACTION READ ONLY', { transaction });
                await database.query("SELECT set_config('statement_timeout', '10000', true)", {
                    transaction,
                });
                // GraphQL resolves fields concurrently, but one PostgreSQL transaction
                // owns one connection. Queue SQL rather than issuing concurrent pg calls.
                let pending = Promise.resolve();

                const connection: QueryPort = {
                    query(sql, options) {
                        const next = pending.then(() => database.query(sql, options));
                        pending = next.then(
                            () => undefined,
                            () => undefined
                        );
                        return next;
                    },
                };

                const context = await createRequestContext(connection, transaction, headers);
                let result: Awaited<ReturnType<typeof server.executeOperation>>;
                try {
                    result = await server.executeOperation(operation, { contextValue: context });
                } finally {
                    // A non-null field failure can finish GraphQL before sibling
                    // promises finish. Let their continuations enqueue and drain
                    // all reads before committing/rolling back this connection.
                    let observed: Promise<void>;
                    do {
                        observed = pending;
                        await observed;
                        await new Promise<void>((resolve) => setImmediate(resolve));
                    } while (observed !== pending);
                }
                if (result.body.kind !== 'single') {
                    throw Error('Incremental responses are unsupported');
                }

                const codes = result.body.singleResult.errors?.map(
                    (error) => error.extensions?.code
                );

                const status = codes?.includes('UNAUTHENTICATED')
                    ? 401
                    : codes?.includes('FORBIDDEN')
                      ? 403
                      : (result.http.status ?? 200);

                const response = { status, body: result.body.singleResult };
                if (context.databaseFailed() || codes?.includes('INTERNAL_SERVER_ERROR')) {
                    throw new RollbackResponse(response);
                }
                return response;
            }
        );
    } catch (error) {
        if (error instanceof RollbackResponse) {
            return error.response;
        }
        if (error instanceof ApiError) {
            return {
                status: error.status,
                body: {
                    errors: [
                        { message: error.message, extensions: { code: error.extensions.code } },
                    ],
                },
            };
        }
        return {
            status: 503,
            body: {
                errors: [
                    {
                        message: 'Service unavailable',
                        extensions: { code: 'INTERNAL_SERVER_ERROR' },
                    },
                ],
            },
        };
    }
}

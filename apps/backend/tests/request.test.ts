import { QueryTypes, type Transaction } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';
import { createRequestContext } from '../src/graphql/context.js';
import { executeRequest } from '../src/graphql/execute.js';

const userId = '10000000-0000-0000-0000-000000000001';
const organizationId = '20000000-0000-0000-0000-000000000001';
const headers = { 'x-user-id': userId, 'x-tenant-id': organizationId };
const transaction = {} as Transaction;

describe('identity and request isolation with mocked database access', () => {
    it.each(['owner', 'admin', 'member', 'viewer'])(
        'permits active %s membership and sets transaction-local tenant',
        async (role) => {
            const query = vi.fn(async (sql: string) =>
                sql.includes('taskboard_identity') ? [{ user_exists: true, role }] : []
            );

            const context = await createRequestContext({ query }, transaction, headers);
            expect(context.board()).toBeDefined();
            expect(query).toHaveBeenCalledWith(
                expect.stringContaining('set_config'),
                expect.objectContaining({
                    transaction,
                    type: QueryTypes.SELECT,
                    bind: { org: organizationId },
                })
            );
        }
    );
    it('rejects inactive/unknown users, nonmembers and inactive memberships', async () => {
        for (const identity of [
            { user_exists: false, role: null },
            { user_exists: true, role: null },
        ]) {
            const query = vi.fn(async () => [identity]);
            await expect(
                createRequestContext({ query }, transaction, headers)
            ).rejects.toMatchObject({ status: identity.user_exists ? 403 : 401 });
        }
    });
    it('allows headerless local directory but not tenant resources', async () => {
        const query = vi.fn(async () => [{ id: organizationId, name: 'Org', members: [] }]);
        const context = await createRequestContext({ query }, transaction, {});
        expect(() => context.board()).toThrow('valid user');
        expect(await context.organizations()).toHaveLength(1);
    });
    it('rejects missing/duplicate/malformed header identity before database access', async () => {
        for (const input of [
            { 'x-user-id': userId },
            { ...headers, 'x-user-id': 'invalid' },
            { ...headers, 'x-user-id': [userId, userId] },
        ]) {
            const query = vi.fn();
            await expect(createRequestContext({ query }, transaction, input)).rejects.toMatchObject(
                { status: 401 }
            );
            expect(query).not.toHaveBeenCalled();
        }
    });
    it('keeps concurrent tenant contexts and caches separate', async () => {
        const query = vi.fn(async (sql: string, options: { bind?: Record<string, unknown> }) => {
            if (sql.includes('taskboard_identity')) {
                return [{ user_exists: true, role: 'member' }];
            }
            if (sql.includes('FROM organizations')) {
                return [{ id: options.bind?.org }];
            }
            return [];
        });

        const orgB = '20000000-0000-0000-0000-000000000002';

        const [a, b] = await Promise.all([
            createRequestContext({ query }, transaction, headers),
            createRequestContext({ query }, {} as Transaction, { ...headers, 'x-tenant-id': orgB }),
        ]);

        expect(await a.board().organization()).toEqual({ id: organizationId });
        expect(await b.board().organization()).toEqual({ id: orgB });
        expect(() => a.board(orgB)).toThrow('Access denied');
    });
    it('masks authorization-time database failures', async () => {
        const query = vi.fn().mockRejectedValue(Error('password private SQL'));
        await expect(createRequestContext({ query }, transaction, headers)).rejects.toMatchObject({
            status: 503,
            message: 'Service unavailable',
        });
    });
});

describe('request transaction lifecycle', () => {
    it('drains sibling field reads before closing a failed request transaction', async () => {
        const events: string[] = [];
        let sibling: Promise<unknown> = Promise.resolve();

        const query = vi.fn(async (sql: string) => {
            if (sql.includes('taskboard_identity')) {
                return [{ user_exists: true, role: 'member' }];
            }
            if (sql.includes('FROM projects')) {
                await new Promise((resolve) => setTimeout(resolve, 5));
                events.push('projects');
            }
            if (sql.includes('FROM organizations')) {
                events.push('organization');
                return [{}];
            }
            return [];
        });

        const db = {
            query,
            transaction: async (_: unknown, work: (tx: Transaction) => Promise<unknown>) => {
                try {
                    return await work(transaction);
                } finally {
                    events.push('closed');
                }
            },
        };

        const server = {
            executeOperation: async (
                _: unknown,
                options: { contextValue: Awaited<ReturnType<typeof createRequestContext>> }
            ) => {
                sibling = options.contextValue
                    .board()
                    .projects()
                    .then(() => options.contextValue.board().organization());
                return {
                    http: {},
                    body: {
                        kind: 'single',
                        singleResult: {
                            errors: [
                                {
                                    message: 'failure',
                                    extensions: { code: 'INTERNAL_SERVER_ERROR' },
                                },
                            ],
                        },
                    },
                };
            },
        };

        await executeRequest(
            server as never,
            db as never,
            { query: '{organization{id}}' },
            headers
        );
        await sibling;
        expect(events).toEqual(['projects', 'organization', 'closed']);
    });
    it('serializes SQL on one request connection while allowing parallel field resolution', async () => {
        let running = 0,
            maximum = 0;

        const query = vi.fn(async (sql: string) => {
            running++;
            maximum = Math.max(maximum, running);
            await new Promise((resolve) => setTimeout(resolve, 1));
            running--;
            if (sql.includes('taskboard_identity')) {
                return [{ user_exists: true, role: 'member' }];
            }
            return [];
        });

        const db = {
            query,
            transaction: async (_: unknown, work: (tx: Transaction) => Promise<unknown>) =>
                work(transaction),
        };

        const server = {
            executeOperation: async (
                _: unknown,
                options: { contextValue: Awaited<ReturnType<typeof createRequestContext>> }
            ) => {
                await Promise.all([
                    options.contextValue.board().organization(),
                    options.contextValue.board().projects(),
                ]);
                return { http: {}, body: { kind: 'single', singleResult: { data: {} } } };
            },
        };

        await executeRequest(
            server as never,
            db as never,
            { query: '{organization{id}}' },
            headers
        );
        expect(maximum).toBe(1);
    });
    it('shares one read-only repeatable-read transaction across execution', async () => {
        const query = vi.fn(async (sql: string) =>
            sql.includes('taskboard_identity') ? [{ user_exists: true, role: 'member' }] : []
        );

        const transactions = vi.fn(
            async (_options: unknown, work: (tx: Transaction) => Promise<unknown>) =>
                work(transaction)
        );

        const server = {
            executeOperation: vi.fn(async () => ({
                http: {},
                body: { kind: 'single', singleResult: { data: { ok: true } } },
            })),
        };

        const result = await executeRequest(
            server as never,
            { query, transaction: transactions } as never,
            { query: '{ organization { id } }' },
            headers
        );

        expect(result.status).toBe(200);
        expect(transactions).toHaveBeenCalledWith(
            expect.objectContaining({ isolationLevel: 'REPEATABLE READ', readOnly: true }),
            expect.any(Function)
        );
        expect(server.executeOperation).toHaveBeenCalledTimes(1);
    });
    it('rolls back field-level database failures without leaking SQL', async () => {
        let rolledBack = false;

        const query = vi.fn(async (sql: string) => {
            if (sql.includes('taskboard_identity')) {
                return [{ user_exists: true, role: 'member' }];
            }
            if (sql.includes('FROM organizations')) {
                throw Error('private SQL');
            }
            return [];
        });

        const transactions = async (_: unknown, work: (tx: Transaction) => Promise<unknown>) => {
            try {
                return await work(transaction);
            } catch (error) {
                rolledBack = true;
                throw error;
            }
        };

        const server = {
            executeOperation: async (
                _: unknown,
                options: { contextValue: Awaited<ReturnType<typeof createRequestContext>> }
            ) => {
                try {
                    await options.contextValue.board().organization();
                } catch {
                    /* GraphQL returns field errors */
                }
                return {
                    http: {},
                    body: {
                        kind: 'single',
                        singleResult: {
                            errors: [
                                {
                                    message: 'Service unavailable',
                                    extensions: { code: 'INTERNAL_SERVER_ERROR' },
                                },
                            ],
                        },
                    },
                };
            },
        };

        const result = await executeRequest(
            server as never,
            { query, transaction: transactions } as never,
            { query: '{ organization { id } }' },
            headers
        );

        expect(rolledBack).toBe(true);
        expect(JSON.stringify(result)).not.toContain('private SQL');
    });
});

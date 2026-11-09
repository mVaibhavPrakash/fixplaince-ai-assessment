import { readFile } from 'node:fs/promises';
import { ApolloServer } from '@apollo/server';
import { describe, expect, it, vi } from 'vitest';
import { resolvers } from '../src/graphql/resolvers.js';
import { BoardService } from '../src/board/service.js';
import { TenantGateway } from '../src/database/tenant-gateway.js';
import { createBatchLoader } from '../src/board/batch.js';
import { normalizeFilter, pageSize, decodeCursor, encodeCursor } from '../src/board/validation.js';
import { createRequestContext } from '../src/graphql/context.js';
import type { Transaction } from 'sequelize';

const org = '20000000-0000-0000-0000-000000000001';
const project = '30000000-0000-0000-0000-000000000001';
const user = '10000000-0000-0000-0000-000000000001';
const status = '40000000-0000-0000-0001-000000000001';
const time = '2026-11-09T10:00:00.123456Z';

const task = {
    id: '60000000-0000-0000-0001-000000000001',
    organization_id: org,
    project_id: project,
    title: 'Task',
    status_id: status,
    assignee_id: user,
    created_by: user,
    created_at: time,
    updated_at: time,
    position: 'a0',
    priority: 'HIGH',
    version: 1,
    due_date: '2026-11-08',
};

function gateway() {
    return {
        organizationId: org,
        organization: vi.fn(async () => ({
            id: org,
            name: 'Org',
            time_zone: 'UTC',
            preferences: {},
        })),
        projects: vi.fn(async () => [{ id: project, organization_id: org, name: 'Project' }]),
        statuses: vi.fn(async () => [
            { id: status, project_id: project, name: 'Todo', position: 'a0', is_done: false },
        ]),
        labels: vi.fn(async () => []),
        users: vi.fn(async () => [{ id: user, display_name: 'User', is_active: true }]),
        members: vi.fn(async () => [
            { organization_id: org, user_id: user, role: 'owner', is_active: true },
        ]),
        taskLabels: vi.fn(async () => []),
        task: vi.fn(async () => task),
        tasks: vi.fn(async () => [task]),
        summary: vi.fn(async () => [
            { dimension: 'total', key: null, count: 1, overdue: 1 },
            { dimension: 'status', key: status, count: 1 },
            { dimension: 'assignee', key: user, count: 1 },
            { dimension: 'priority', key: 'HIGH', count: 1 },
        ]),
        history: vi.fn(async (relation: string, requests: unknown[]) =>
            requests.map(() =>
                relation === 'comments'
                    ? [
                          {
                              id: task.id,
                              author_id: user,
                              body: 'Hi',
                              created_at: time,
                              updated_at: time,
                          },
                      ]
                    : [
                          {
                              id: task.id,
                              actor_id: user,
                              action: 'CREATED',
                              changes: {},
                              created_at: time,
                          },
                      ]
            )
        ),
    };
}

describe('input and cursor contracts', () => {
    it.each([0, 101, -1, 1.5])('rejects page size %s', (size) =>
        expect(() => pageSize(size)).toThrow()
    );
    it('validates combined dates, identity and contradictory filters', () => {
        expect(() => normalizeFilter({ dueDateFrom: '2026-02-30' })).toThrow();
        expect(() =>
            normalizeFilter({ dueDateFrom: '2026-11-10', dueDateTo: '2026-11-01' })
        ).toThrow();
        expect(() => normalizeFilter({ assigneeId: user, unassigned: true })).toThrow();
        expect(() => normalizeFilter({ statusId: 'bad' })).toThrow();
        expect(normalizeFilter({ priority: 'HIGH', unassigned: false })).toEqual({
            priority: 'HIGH',
            unassigned: false,
        });
    });
    it('retains microseconds and rejects cursors from another context', () => {
        const cursor = encodeCursor({ scope: 'scope-a', time, id: task.id });
        expect(decodeCursor(cursor, 'scope-a')).toEqual({ scope: 'scope-a', time, id: task.id });
        expect(() => decodeCursor(cursor, 'scope-b')).toThrow();
        expect(() => decodeCursor('invalid', 'scope-a')).toThrow();
    });
});

describe('request-local batching', () => {
    it('batches and deduplicates keys without sharing values across requests', async () => {
        const batch = vi.fn(async (keys: string[]) => keys.map((key) => key.toUpperCase()));
        const loader = createBatchLoader(batch);
        expect(await Promise.all([loader('a'), loader('b'), loader('a')])).toEqual(['A', 'B', 'A']);
        expect(batch).toHaveBeenCalledTimes(1);
        expect(batch).toHaveBeenCalledWith(['a', 'b']);
        await createBatchLoader(batch)('a');
        expect(batch).toHaveBeenCalledTimes(2);
    });
    it('rejects every queued key on a batch failure', async () => {
        const load = createBatchLoader(async () => {
            throw Error('failed');
        });

        const result = await Promise.allSettled([load('a'), load('b')]);
        expect(result.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    });
});

describe('complete GraphQL schema using a mocked data gateway', () => {
    it('uses normal organization/member/user types for discovery without opening protected fields', async () => {
        const typeDefs = await readFile(
            new URL('../../../graphql/schema.graphql', import.meta.url),
            'utf8'
        );

        const server = new ApolloServer({ typeDefs, resolvers });

        const query = vi.fn(async () => [
            {
                id: org,
                name: 'Org',
                members: [
                    {
                        organization_id: org,
                        user_id: user,
                        is_active: true,
                        user: { id: user, display_name: 'User', is_active: true },
                    },
                ],
            },
        ]);

        const contextValue = await createRequestContext({ query }, {} as Transaction, {});
        try {
            const result = await server.executeOperation(
                {
                    query: '{ organizations { id name members { isActive user { id displayName isActive } } } }',
                },
                { contextValue }
            );

            if (result.body.kind !== 'single') {
                throw Error('Unexpected response');
            }
            expect(result.body.singleResult.errors).toBeUndefined();
            expect(result.body.singleResult.data?.organizations).toEqual([
                {
                    id: org,
                    name: 'Org',
                    members: [
                        { isActive: true, user: { id: user, displayName: 'User', isActive: true } },
                    ],
                },
            ]);
            for (const field of ['projects { id }', 'settings { timeZone }', 'members { role }']) {
                const denied = await server.executeOperation(
                    { query: `{ organizations { ${field} } }` },
                    { contextValue }
                );

                if (denied.body.kind !== 'single') {
                    throw Error('Unexpected response');
                }
                expect(denied.body.singleResult.errors?.[0].extensions?.code).toBe(
                    'UNAUTHENTICATED'
                );
            }
            expect(query).toHaveBeenCalledTimes(1);
        } finally {
            await server.stop();
        }
    });

    async function execute(query: string, mock = gateway(), variables?: Record<string, unknown>) {
        const typeDefs = await readFile(
            new URL('../../../graphql/schema.graphql', import.meta.url),
            'utf8'
        );

        const server = new ApolloServer({ typeDefs, resolvers });
        const board = new BoardService(mock);

        const result = await server.executeOperation(
            { query, variables },
            {
                contextValue: {
                    board: () => board,
                    organizations: async () => [
                        {
                            id: org,
                            name: 'Org',
                            members: [
                                {
                                    organization_id: org,
                                    user_id: user,
                                    is_active: true,
                                    user: { id: user, display_name: 'User', is_active: true },
                                },
                            ],
                        },
                    ],
                },
            }
        );

        await server.stop();
        if (result.body.kind !== 'single') {
            throw Error('Unexpected incremental response');
        }
        return { result: result.body.singleResult, mock };
    }

    it('resolves organization, settings, members, projects, statuses, labels and directory', async () => {
        const { result } =
            await execute(`{ organizations { id name members { isActive user { id displayName isActive } } }
      organization { id name settings { timeZone preferences } members { role isActive user { id displayName isActive } }
        projects { id organizationId name description statuses { id name position isDone } labels { id name } } } }`);

        expect(result.errors).toBeUndefined();
        expect(result.data?.organization).toMatchObject({
            settings: { timeZone: 'UTC' },
            members: [{ role: 'OWNER' }],
        });
    });

    it('resolves all task, comment, activity and summary fields with batched related reads', async () => {
        const { result, mock } = await execute(
            `query($p:ID!){ tasks(projectId:$p) { edges { cursor node {
      id organizationId projectId title description position version priority dueDate createdAt updatedAt
      assignee { role isActive user { id displayName isActive } } createdBy { id displayName }
      status { id name position isDone } labels { id name }
      comments { edges { cursor node { id body createdAt updatedAt author { id displayName } } } pageInfo { endCursor hasNextPage } }
      activity { edges { cursor node { id action changes createdAt actor { id displayName } } } pageInfo { endCursor hasNextPage } }
    } } pageInfo { endCursor hasNextPage } }
    taskSummary(projectId:$p) { total overdue byStatus { status { id } count } byAssignee { assignee { user { id } } count } byPriority { priority count } } }`,
            gateway(),
            { p: project }
        );

        expect(result.errors).toBeUndefined();
        expect(result.data?.taskSummary).toMatchObject({ total: 1, overdue: 1 });
        expect(mock.users).toHaveBeenCalledTimes(1);
        expect(mock.members).toHaveBeenCalledTimes(1);
    });

    it('returns empty connections and zero-filled status/priority summaries', async () => {
        const mock = gateway();
        mock.tasks.mockResolvedValue([]);
        mock.summary.mockResolvedValue([]);

        const { result } = await execute(
            `query($p:ID!){tasks(projectId:$p){edges{node{id}} pageInfo{endCursor hasNextPage}}
      taskSummary(projectId:$p){total overdue byStatus{count} byPriority{count}}}`,
            mock,
            { p: project }
        );

        expect(result.errors).toBeUndefined();
        expect(result.data?.tasks).toEqual({
            edges: [],
            pageInfo: { endCursor: null, hasNextPage: false },
        });
        expect(result.data?.taskSummary).toMatchObject({
            total: 0,
            overdue: 0,
            byStatus: [{ count: 0 }],
        });
    });

    it('does not grow nested lookup query counts with task page size', async () => {
        const mock = gateway();
        mock.tasks.mockResolvedValue(
            Array.from({ length: 20 }, (_, n) => ({
                ...task,
                id: `60000000-0000-0000-0001-${String(n + 1).padStart(12, '0')}`,
            }))
        );

        const { result } = await execute(
            `query($p:ID!){tasks(projectId:$p){edges{node{
      assignee{user{id}} createdBy{id} status{id} labels{id} comments{edges{node{author{id}}}} activity{edges{node{actor{id}}}}
    }}}}`,
            mock,
            { p: project }
        );

        expect(result.errors).toBeUndefined();
        expect(mock.users).toHaveBeenCalledTimes(1);
        expect(mock.members).toHaveBeenCalledTimes(1);
        expect(mock.taskLabels).toHaveBeenCalledTimes(1);
        expect(mock.history).toHaveBeenCalledTimes(2);
    });
});

describe('tenant gateway boundaries', () => {
    it('rejects missing authorization context', () => {
        expect(() => new TenantGateway({} as never, {} as never, undefined as never)).toThrow();
    });
});

describe('board query behavior with a mocked gateway', () => {
    it('deduplicates identical list/summary calls within a request', async () => {
        const mock = gateway(),
            board = new BoardService(mock);

        await Promise.all([
            board.tasks(project),
            board.tasks(project),
            board.summary(project),
            board.summary(project),
        ]);
        expect(mock.tasks).toHaveBeenCalledTimes(1);
        expect(mock.summary).toHaveBeenCalledTimes(1);
    });
    it('fetches one extra row and continues using the full-precision cursor', async () => {
        const mock = gateway();
        mock.tasks.mockResolvedValue([
            task,
            { ...task, id: '60000000-0000-0000-0001-000000000002' },
        ]);
        const board = new BoardService(mock);
        const page = await board.tasks(project, null, { first: 1 });
        expect(page.edges).toHaveLength(1);
        expect(page.pageInfo.hasNextPage).toBe(true);
        await board.tasks(project, null, { first: 1, after: page.pageInfo.endCursor });
        expect(mock.tasks).toHaveBeenLastCalledWith(
            project,
            {},
            1,
            expect.objectContaining({ time, id: task.id })
        );
    });
    it('rejects a task cursor when the filter changes', async () => {
        const board = new BoardService(gateway());
        const page = await board.tasks(project);
        expect(() =>
            board.tasks(project, { priority: 'URGENT' }, { after: page.pageInfo.endCursor })
        ).toThrow('Invalid cursor');
    });
    it('keeps per-parent history cursors/limits distinct while batching the relation', async () => {
        const mock = gateway(),
            board = new BoardService(mock);

        const [first] = await Promise.all([
            board.history('comments', task.id, { first: 1 }),
            board.history('comments', task.id, { first: 2 }),
        ]);

        expect(mock.history).toHaveBeenCalledTimes(1);
        expect(mock.history.mock.calls[0][1]).toEqual([
            expect.objectContaining({ first: 1, taskId: task.id }),
            expect.objectContaining({ first: 2, taskId: task.id }),
        ]);
        expect(() =>
            board.history('activity', task.id, { after: first.pageInfo.endCursor })
        ).toThrow('Invalid cursor');
    });
    it('rejects inaccessible projects, foreign statuses and unknown assignees', async () => {
        const mock = gateway();
        mock.projects.mockResolvedValue([]);
        await expect(new BoardService(mock).tasks(project)).rejects.toThrow('Project unavailable');
        const other = '40000000-0000-0000-0002-000000000001';
        await expect(
            new BoardService(gateway()).tasks(project, { statusId: other })
        ).rejects.toThrow('Status unavailable');
        const withoutMember = gateway();
        withoutMember.members.mockResolvedValue([]);
        await expect(
            new BoardService(withoutMember).tasks(project, { assigneeId: user })
        ).rejects.toThrow('Assignee unavailable');
    });
    it('returns null for unavailable task detail and isolates caches across services', async () => {
        const mock = gateway();
        mock.task.mockResolvedValue(null as never);
        expect(await new BoardService(mock).task(task.id)).toBeNull();
        await new BoardService(mock).user(user);
        await new BoardService(mock).user(user);
        expect(mock.users).toHaveBeenCalledTimes(2);
    });
});

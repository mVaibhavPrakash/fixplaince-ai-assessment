import { expect, it, vi } from 'vitest';
import { createApi } from '../src/api';
import { boardData, emptyConnection } from './fixtures';

it('keeps discovery headerless and sends identity headers on workspace requests', async () => {
    const fetcher = vi
        .fn()
        .mockImplementation(
            async () =>
                new Response(JSON.stringify({ data: { organizations: [], organization: {} } }))
        );

    const api = createApi('/graphql', fetcher),
        signal = new AbortController().signal;

    await api.organizations(signal);
    expect(fetcher.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
    await api.workspace({ organizationId: 'org-1', userId: 'user-1' }, signal);
    expect(fetcher.mock.calls[1][1]).toMatchObject({
        signal,
        headers: { 'x-tenant-id': 'org-1', 'x-user-id': 'user-1' },
    });
});

it('loads initial columns and complete summary in one operation using server filters', async () => {
    const fetcher = vi.fn().mockResolvedValue(
        new Response(
            JSON.stringify({
                data: {
                    column0: emptyConnection(),
                    column1: emptyConnection(),
                    taskSummary: boardData().summary,
                },
            })
        )
    );

    const api = createApi('/graphql', fetcher);

    const result = await api.board(
        {
            identity: { organizationId: 'o', userId: 'u' },
            projectId: 'p',
            filter: { priority: 'HIGH' },
            statusIds: ['todo', 'done'],
        },
        new AbortController().signal
    );

    const operation = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(operation.variables).toMatchObject({
        filter: { priority: 'HIGH' },
        filter0: { priority: 'HIGH', statusId: 'todo' },
        filter1: { priority: 'HIGH', statusId: 'done' },
    });
    expect(operation.query).toContain('taskSummary');
    expect(result.columns.todo).toEqual(emptyConnection());
    fetcher.mockImplementation(
        async () => new Response(JSON.stringify({ data: { taskSummary: boardData().summary } }))
    );
    await api.board(
        {
            identity: { organizationId: 'o', userId: 'u' },
            projectId: 'p',
            filter: {},
            statusIds: [],
        },
        new AbortController().signal
    );
    expect(JSON.parse(fetcher.mock.calls[1][1].body).query).not.toContain('$first');
});

it('rejects GraphQL errors instead of presenting partial success', async () => {
    const fetcher = vi.fn().mockResolvedValue(
        new Response(
            JSON.stringify({
                data: { organizations: [] },
                errors: [{ message: 'Access denied' }],
            })
        )
    );

    await expect(
        createApi('/graphql', fetcher).organizations(new AbortController().signal)
    ).rejects.toThrow('Access denied');
});

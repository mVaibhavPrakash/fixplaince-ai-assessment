import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from '../src/App';
import { RootProvider, useRootContext, useOrganization } from '../src/context/RootContext';
import type { BoardData, Organization } from '../src/types';
import {
    boardData,
    deferred,
    emptyConnection,
    fakeApi,
    member,
    statuses,
    task,
    workspace,
} from './fixtures';

it('handles loading, a board error and retry with the current identity', async () => {
    const api = fakeApi(),
        directory = deferred<Organization[]>();

    api.organizations.mockReturnValue(directory.promise);
    api.board.mockRejectedValueOnce(Error('Could not load the board'));
    render(<App api={api} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading organizations');
    await act(async () =>
        directory.resolve([{ id: 'org-1', name: 'Studio One', members: [member] }])
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the board');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(task.title)).toBeVisible();
    expect(api.workspace).toHaveBeenCalledWith(
        { organizationId: 'org-1', userId: 'user-1' },
        expect.any(AbortSignal)
    );
});

it('renders server summaries and chart, then merges a column page without duplicate or stale tasks', async () => {
    const api = fakeApi();
    api.page.mockResolvedValue({
        tasks: {
            edges: [
                { cursor: 'old', node: { ...task, version: 1, title: 'Outdated title' } },
                { cursor: 'next', node: { ...task, id: 'task-2', title: 'Ship the release' } },
            ],
            pageInfo: { endCursor: 'next', hasNextPage: false },
        },
        taskSummary: boardData().summary,
    });
    render(<App api={api} />);
    expect(await screen.findByText(task.title)).toBeVisible();
    expect(screen.getByLabelText('Total matching tasks')).toHaveTextContent('50');
    expect(screen.getByLabelText('Overdue tasks')).toHaveTextContent('3');
    expect(screen.getByRole('figure', { name: 'Tasks by status' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Priority distribution' })).toHaveTextContent(
        'Urgent'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load more To do tasks' }));
    expect(await screen.findByText('Ship the release')).toBeVisible();
    expect(screen.getAllByText(task.title)).toHaveLength(1);
    expect(screen.queryByText('Outdated title')).not.toBeInTheDocument();
    expect(api.page).toHaveBeenCalledWith(
        expect.objectContaining({ statusId: 'todo', after: 'cursor-1', filter: {} }),
        expect.any(AbortSignal)
    );
});

it('submits combined filters to the server and resets column pagination', async () => {
    const api = fakeApi();
    api.workspace.mockResolvedValue({
        ...workspace,
        projects: [
            ...workspace.projects,
            { ...workspace.projects[0], id: 'project-2', name: 'Another project' },
        ],
    });
    render(<App api={api} />);
    await screen.findByText(task.title);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'todo' } });
    fireEvent.change(screen.getByLabelText('Assignee'), { target: { value: 'user-1' } });
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'HIGH' } });
    fireEvent.change(screen.getByLabelText('Due from'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Due to'), { target: { value: '2026-11-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() =>
        expect(api.board).toHaveBeenLastCalledWith(
            expect.objectContaining({
                statusIds: ['todo'],
                filter: {
                    statusId: 'todo',
                    assigneeId: 'user-1',
                    priority: 'HIGH',
                    dueDateFrom: '2026-11-01',
                    dueDateTo: '2026-11-30',
                },
            }),
            expect.any(AbortSignal)
        )
    );
    expect(api.page).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'project-2' } });
    await waitFor(() =>
        expect(api.board).toHaveBeenLastCalledWith(
            expect.objectContaining({
                projectId: 'project-2',
                filter: {},
                statusIds: ['todo', 'done'],
            }),
            expect.any(AbortSignal)
        )
    );
});

it('changes organization/user atomically and ignores an older tenant response', async () => {
    const api = fakeApi(),
        old = deferred<BoardData>();

    const secondMember = {
        ...member,
        user: { ...member.user, id: 'user-2', displayName: 'Kai Chen' },
    };

    api.organizations.mockResolvedValue([
        { id: 'org-1', name: 'Studio One', members: [member] },
        { id: 'org-2', name: 'Studio Two', members: [secondMember] },
    ]);
    api.workspace.mockImplementation(async (identity) =>
        identity.organizationId === 'org-1'
            ? workspace
            : { ...workspace, id: 'org-2', name: 'Studio Two', members: [secondMember] }
    );
    api.board.mockReturnValueOnce(old.promise).mockResolvedValue({
        ...boardData(),
        columns: {
            todo: {
                edges: [
                    {
                        cursor: 'b',
                        node: { ...task, id: 'tenant-b-task', title: 'Second workspace task' },
                    },
                ],
                pageInfo: { endCursor: 'b', hasNextPage: false },
            },
            done: emptyConnection(),
        },
    });
    render(<App api={api} />);
    await waitFor(() => expect(api.board).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'org-2' } });
    expect(await screen.findByText('Second workspace task')).toBeVisible();
    await act(async () => old.resolve(boardData()));
    expect(screen.queryByText(task.title)).not.toBeInTheDocument();
    expect(
        within(screen.getByLabelText('Viewing as')).getByRole('option', { name: 'Kai Chen' })
    ).toBeInTheDocument();
    expect(api.workspace).toHaveBeenLastCalledWith(
        { organizationId: 'org-2', userId: 'user-2' },
        expect.any(AbortSignal)
    );
});

it('renders an empty filtered board with zero metrics', async () => {
    const api = fakeApi();
    api.board.mockResolvedValue({
        columns: { todo: emptyConnection(), done: emptyConnection() },
        summary: {
            total: 0,
            overdue: 0,
            byStatus: statuses.map((status) => ({ status, count: 0 })),
            byPriority: [],
        },
    });
    render(<App api={api} />);
    expect(await screen.findByText('No tasks match these filters')).toBeVisible();
    expect(screen.getByLabelText('Total matching tasks')).toHaveTextContent('0');
});

it('does not issue tenant requests without an available organization/user', async () => {
    const api = fakeApi();
    api.organizations.mockResolvedValue([{ id: 'org-1', name: 'Studio One', members: [] }]);
    render(<App api={api} />);
    expect(await screen.findByText('No active users in this organization')).toBeVisible();
    expect(api.workspace).not.toHaveBeenCalled();
    expect(api.board).not.toHaveBeenCalled();
});

it('shares one state owner across context consumers', async () => {
    const api = fakeApi();
    api.organizations.mockResolvedValue([
        { id: 'org-1', name: 'Studio One', members: [member] },
        { id: 'org-2', name: 'Studio Two', members: [member] },
    ]);

    function Consumer({ label }: { label: string }) {
        const { organization, workspace, taskBoard } = useRootContext();
        const { identity, selectOrganization } = useOrganization();
        expect(organization.identity).toBe(identity);
        expect(workspace.selectProject).toBeTypeOf('function');
        expect(taskBoard.loadMore).toBeTypeOf('function');
        return (
            <div>
                <output aria-label={label}>{identity.organizationId}</output>
                <button onClick={() => selectOrganization('org-2')}>Switch {label}</button>
            </div>
        );
    }

    render(
        <RootProvider api={api}>
            <Consumer label="first" />
            <Consumer label="second" />
        </RootProvider>
    );
    await waitFor(() => expect(screen.getByLabelText('first')).toHaveTextContent('org-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Switch first' }));
    expect(screen.getByLabelText('first')).toHaveTextContent('org-2');
    expect(screen.getByLabelText('second')).toHaveTextContent('org-2');
    expect(api.organizations).toHaveBeenCalledTimes(1);
});

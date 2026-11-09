import { vi } from 'vitest';
import type { BoardApi, BoardData, Task, TaskStatus, Workspace } from '../src/types';

export const statuses: TaskStatus[] = [
    { id: 'todo', name: 'To do', position: 'a0', isDone: false },
    { id: 'done', name: 'Done', position: 'a1', isDone: true },
];
export const user = { id: 'user-1', displayName: 'Asha Rao', isActive: true };
export const member = { user, isActive: true, role: 'OWNER' as const };
export const task: Task = {
    id: 'task-1',
    title: 'Review task permissions',
    description: 'Keep each workspace isolated.',
    priority: 'HIGH',
    position: 'a0',
    version: 2,
    dueDate: '2026-11-12',
    status: statuses[0],
    assignee: member,
    labels: [{ id: 'label-1', name: 'Platform' }],
};
export const workspace: Workspace = {
    id: 'org-1',
    name: 'Studio One',
    settings: { timeZone: 'UTC' },
    members: [member],
    projects: [
        {
            id: 'project-1',
            name: 'Platform',
            description: 'Make the next release count.',
            statuses,
        },
    ],
};
export const emptyConnection = () => ({
    edges: [],
    pageInfo: { endCursor: null, hasNextPage: false },
});
export function boardData(): BoardData {
    return {
        columns: {
            todo: {
                edges: [{ cursor: 'cursor-1', node: task }],
                pageInfo: { endCursor: 'cursor-1', hasNextPage: true },
            },
            done: emptyConnection(),
        },
        summary: {
            total: 50,
            overdue: 3,
            byStatus: [
                { status: statuses[0], count: 40 },
                { status: statuses[1], count: 10 },
            ],
            byPriority: [
                { priority: 'LOW', count: 10 },
                { priority: 'MEDIUM', count: 20 },
                { priority: 'HIGH', count: 15 },
                { priority: 'URGENT', count: 5 },
            ],
        },
    };
}
export function fakeApi() {
    return {
        organizations: vi
            .fn<BoardApi['organizations']>()
            .mockResolvedValue([{ id: 'org-1', name: 'Studio One', members: [member] }]),
        workspace: vi.fn<BoardApi['workspace']>().mockResolvedValue(workspace),
        board: vi.fn<BoardApi['board']>().mockResolvedValue(boardData()),
        page: vi
            .fn<BoardApi['page']>()
            .mockResolvedValue({ tasks: emptyConnection(), taskSummary: boardData().summary }),
    };
}
export function deferred<T>() {
    let resolve!: (value: T) => void;

    const promise = new Promise<T>((done) => {
        resolve = done;
    });

    return { promise, resolve };
}

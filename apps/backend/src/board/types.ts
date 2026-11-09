export type Row = Record<string, unknown>;
export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export interface Identity {
    userId: string;
    organizationId: string;
    role: (typeof ROLES)[number];
}
export interface TaskFilter {
    statusId?: string | null;
    assigneeId?: string | null;
    unassigned?: boolean | null;
    priority?: string | null;
    dueDateFrom?: string | null;
    dueDateTo?: string | null;
}
export interface Cursor {
    scope: string;
    time: string;
    id: string;
}
export interface PageArgs {
    first?: number | null;
    after?: string | null;
}
export interface HistoryRequest {
    taskId: string;
    first: number;
    cursor: Cursor | null;
}
export type Relation = 'comments' | 'activity';
export interface BoardGateway {
    readonly organizationId: string;
    organization(): Promise<Row>;
    projects(ids?: string[]): Promise<Row[]>;
    statuses(projectIds: string[]): Promise<Row[]>;
    labels(projectIds: string[]): Promise<Row[]>;
    users(ids: string[]): Promise<Row[]>;
    members(ids?: string[]): Promise<Row[]>;
    taskLabels(ids: string[]): Promise<Row[]>;
    task(id: string): Promise<Row | null>;
    tasks(
        projectId: string,
        filter: TaskFilter,
        first: number,
        cursor: Cursor | null
    ): Promise<Row[]>;
    summary(projectId: string, filter: TaskFilter): Promise<Row[]>;
    history(relation: Relation, requests: HistoryRequest[]): Promise<Row[][]>;
}

export function text(row: Row, key: string): string {
    const value = row[key];
    if (typeof value !== 'string') {
        throw new Error('Missing data field');
    }
    return value;
}

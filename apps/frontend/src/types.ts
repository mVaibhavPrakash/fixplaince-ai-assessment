export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];
export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
export interface User {
    id: string;
    displayName: string;
    isActive: boolean;
}
export interface Member {
    user: User;
    isActive: boolean;
    role: Role;
}
export interface Organization {
    id: string;
    name: string;
    members: Omit<Member, 'role'>[];
}
export interface Identity {
    organizationId: string;
    userId: string;
}
export interface TaskStatus {
    id: string;
    name: string;
    position: string;
    isDone: boolean;
}
export interface Project {
    id: string;
    name: string;
    description: string | null;
    statuses: TaskStatus[];
}
export interface Workspace {
    id: string;
    name: string;
    settings: { timeZone: string };
    members: Member[];
    projects: Project[];
}
export interface Task {
    id: string;
    title: string;
    description: string | null;
    priority: Priority;
    position: string;
    version: number;
    dueDate: string | null;
    status: TaskStatus;
    assignee: Member | null;
    labels: { id: string; name: string }[];
}
export interface TaskFilter {
    statusId?: string;
    assigneeId?: string;
    unassigned?: boolean;
    priority?: Priority;
    dueDateFrom?: string;
    dueDateTo?: string;
}
export interface TaskConnection {
    edges: { cursor: string; node: Task }[];
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
}
export interface ColumnState {
    tasks: Task[];
    endCursor: string | null;
    hasNextPage: boolean;
    loading: boolean;
    error: string | null;
}
export interface TaskSummary {
    total: number;
    overdue: number;
    byStatus: { status: TaskStatus; count: number }[];
    byPriority: { priority: Priority; count: number }[];
}
export interface BoardRequest {
    identity: Identity;
    projectId: string;
    filter: TaskFilter;
    statusIds: string[];
}
export interface BoardData {
    columns: Record<string, TaskConnection>;
    summary: TaskSummary;
}
export interface PageData {
    tasks: TaskConnection;
    taskSummary: TaskSummary;
}
export interface BoardApi {
    organizations(signal: AbortSignal): Promise<Organization[]>;
    workspace(identity: Identity, signal: AbortSignal): Promise<Workspace>;
    board(request: BoardRequest, signal: AbortSignal): Promise<BoardData>;
    page(
        request: Omit<BoardRequest, 'statusIds'> & { statusId: string; after: string },
        signal: AbortSignal
    ): Promise<PageData>;
}

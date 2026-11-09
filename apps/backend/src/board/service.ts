import { createBatchLoader } from './batch.js';
import { badInput } from './errors.js';
import {
    cursorScope,
    decodeCursor,
    encodeCursor,
    normalizeFilter,
    pageSize,
    uuid,
} from './validation.js';
import {
    PRIORITIES,
    text,
    type BoardGateway,
    type HistoryRequest,
    type PageArgs,
    type Relation,
    type Row,
    type TaskFilter,
} from './types.js';

export class BoardService {
    #memo = new Map<string, Promise<unknown>>();
    readonly user;
    readonly member;
    readonly project;
    readonly statuses;
    readonly labels;
    readonly taskLabels;
    readonly #comments;
    readonly #activity;
    constructor(private readonly gateway: BoardGateway) {
        const byId = (rows: Row[], id: string, field = 'id') =>
            rows.find((row) => row[field] === id) ?? null;

        this.user = createBatchLoader(async (ids: string[]) => {
            const rows = await gateway.users(ids);
            return ids.map((id) => byId(rows, id));
        });
        this.member = createBatchLoader(async (ids: string[]) => {
            const rows = await gateway.members(ids);
            return ids.map((id) => byId(rows, id, 'user_id'));
        });
        this.project = createBatchLoader(async (ids: string[]) => {
            const rows = await gateway.projects(ids);
            return ids.map((id) => byId(rows, id));
        });
        this.statuses = createBatchLoader(async (ids: string[]) => {
            const rows = await gateway.statuses(ids);
            return ids.map((id) => rows.filter((row) => row.project_id === id));
        });
        this.labels = createBatchLoader(async (ids: string[]) => {
            const rows = await gateway.labels(ids);
            return ids.map((id) => rows.filter((row) => row.project_id === id));
        });
        this.taskLabels = createBatchLoader(async (ids: string[]) => {
            const rows = await gateway.taskLabels(ids);
            return ids.map((id) => rows.filter((row) => row.task_id === id));
        });
        this.#comments = createBatchLoader((requests: HistoryRequest[]) =>
            gateway.history('comments', requests)
        );
        this.#activity = createBatchLoader((requests: HistoryRequest[]) =>
            gateway.history('activity', requests)
        );
    }
    #once<T>(key: string, work: () => Promise<T>): Promise<T> {
        if (!this.#memo.has(key)) {
            this.#memo.set(key, work());
        }
        return this.#memo.get(key) as Promise<T>;
    }
    organization() {
        return this.#once('organization', () => this.gateway.organization());
    }
    members() {
        return this.#once('members', () => this.gateway.members());
    }
    projects() {
        return this.#once('projects', () => this.gateway.projects());
    }
    task(id: string) {
        return this.#once(`task:${uuid(id)}`, () => this.gateway.task(uuid(id)));
    }
    async status(projectId: string, statusId: string) {
        return (await this.statuses(projectId)).find((row) => row.id === statusId) ?? null;
    }
    async #validate(projectId: string, filter: TaskFilter) {
        if (!(await this.project(projectId))) {
            throw badInput('Project unavailable');
        }
        if (filter.statusId && !(await this.status(projectId, filter.statusId))) {
            throw badInput('Status unavailable for project');
        }
        if (filter.assigneeId && !(await this.member(filter.assigneeId))) {
            throw badInput('Assignee unavailable');
        }
    }
    #connection(rows: Row[], first: number, scope: string) {
        const edges = rows.slice(0, first).map((node) => ({
            node,
            cursor: encodeCursor({
                scope,
                time: text(node, 'created_at'),
                id: text(node, 'id'),
            }),
        }));

        return {
            edges,
            pageInfo: { endCursor: edges.at(-1)?.cursor ?? null, hasNextPage: rows.length > first },
        };
    }
    tasks(projectId: string, input?: TaskFilter | null, args: PageArgs = {}) {
        const project = uuid(projectId),
            filter = normalizeFilter(input),
            first = pageSize(args.first);

        const scope = cursorScope(
            this.gateway.organizationId,
            project,
            'tasks',
            filter,
            'created_at,id'
        );

        const cursor = decodeCursor(args.after, scope);
        return this.#once(JSON.stringify(['tasks', project, filter, first, cursor]), async () => {
            await this.#validate(project, filter);
            return this.#connection(
                await this.gateway.tasks(project, filter, first, cursor),
                first,
                scope
            );
        });
    }
    history(relation: Relation, taskId: string, args: PageArgs = {}) {
        const first = pageSize(args.first);
        const scope = cursorScope(this.gateway.organizationId, taskId, relation, 'created_at,id');
        const request = { taskId, first, cursor: decodeCursor(args.after, scope) };
        const loader = relation === 'comments' ? this.#comments : this.#activity;
        return loader(request).then((rows) => this.#connection(rows, first, scope));
    }
    summary(projectId: string, input?: TaskFilter | null) {
        const project = uuid(projectId),
            filter = normalizeFilter(input);

        return this.#once(JSON.stringify(['summary', project, filter]), async () => {
            await this.#validate(project, filter);

            const [rows, statuses] = await Promise.all([
                this.gateway.summary(project, filter),
                this.statuses(project),
            ]);

            const count = (dimension: string, key?: unknown) =>
                Number(
                    rows.find(
                        (row) =>
                            row.dimension === dimension && (key === undefined || row.key === key)
                    )?.count ?? 0
                );

            return {
                total: count('total'),
                overdue: Number(rows.find((row) => row.dimension === 'total')?.overdue ?? 0),
                byStatus: statuses.map((status) => ({ status, count: count('status', status.id) })),
                byPriority: PRIORITIES.map((priority) => ({
                    priority,
                    count: count('priority', priority),
                })),
                byAssignee: await Promise.all(
                    rows
                        .filter((row) => row.dimension === 'assignee')
                        .map(async (row) => ({
                            assignee: row.key == null ? null : await this.member(String(row.key)),
                            count: Number(row.count),
                        }))
                ),
            };
        });
    }
}

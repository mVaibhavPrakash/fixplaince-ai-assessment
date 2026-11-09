import { QueryTypes, type Transaction } from 'sequelize';
import { unavailable, forbidden } from '../board/errors.js';
import {
    ROLES,
    type BoardGateway,
    type Cursor,
    type HistoryRequest,
    type Identity,
    type Relation,
    type Row,
    type TaskFilter,
} from '../board/types.js';

export interface QueryPort {
    query(
        sql: string,
        options: { type: QueryTypes; transaction: Transaction; bind?: Record<string, unknown> }
    ): Promise<unknown>;
}

const timestamps = (alias: string) =>
    `to_char(${alias}.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`;

const updated = (alias: string) =>
    `to_char(${alias}.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`;

export class TenantGateway implements BoardGateway {
    readonly organizationId: string;
    constructor(
        private readonly database: QueryPort,
        private readonly transaction: Transaction,
        identity: Identity,
        private readonly onFailure: () => void = () => {}
    ) {
        if (!identity?.organizationId || !identity.userId || !ROLES.includes(identity.role)) {
            throw forbidden();
        }
        this.organizationId = identity.organizationId;
    }
    async #select(sql: string, bind: Record<string, unknown> = {}): Promise<Row[]> {
        try {
            return (await this.database.query(sql, {
                transaction: this.transaction,
                type: QueryTypes.SELECT,
                bind: { ...bind, org: this.organizationId },
            })) as Row[];
        } catch {
            this.onFailure();
            throw unavailable();
        }
    }
    // All tenant predicates live here. Resolvers cannot pass Sequelize options or raw SQL.
    #scope(alias: string, column = 'organization_id') {
        return `${alias}.${column} = $org`;
    }
    async organization() {
        return (
            await this.#select(`SELECT o.* FROM organizations o WHERE ${this.#scope('o', 'id')}`)
        )[0];
    }
    projects(ids?: string[]) {
        return this.#select(
            `SELECT p.* FROM projects p WHERE ${this.#scope('p')}${ids ? ' AND p.id = ANY($ids::uuid[])' : ''} ORDER BY p.id`,
            { ids }
        );
    }
    statuses(projectIds: string[]) {
        return this.#select(
            `SELECT s.* FROM task_statuses s WHERE ${this.#scope('s')} AND s.project_id = ANY($ids::uuid[]) ORDER BY s.position COLLATE "C", s.id`,
            { ids: projectIds }
        );
    }
    labels(projectIds: string[]) {
        return this.#select(
            `SELECT l.* FROM labels l WHERE ${this.#scope('l')} AND l.project_id = ANY($ids::uuid[]) ORDER BY l.id`,
            { ids: projectIds }
        );
    }
    users(ids: string[]) {
        return this.#select(
            `SELECT u.* FROM users u WHERE u.id = ANY($ids::uuid[]) AND EXISTS
            (SELECT 1 FROM organization_members m WHERE ${this.#scope('m')} AND m.user_id = u.id)`,
            { ids }
        );
    }
    members(ids?: string[]) {
        return this.#select(
            `SELECT m.* FROM organization_members m WHERE ${this.#scope('m')}${ids ? ' AND m.user_id = ANY($ids::uuid[])' : ''} ORDER BY m.user_id`,
            { ids }
        );
    }
    taskLabels(ids: string[]) {
        return this.#select(
            `SELECT l.*, tl.task_id FROM task_labels tl JOIN labels l
            ON l.organization_id = tl.organization_id AND l.project_id = tl.project_id AND l.id = tl.label_id
            WHERE ${this.#scope('tl')} AND tl.task_id = ANY($ids::uuid[]) ORDER BY l.id`,
            { ids }
        );
    }
    async task(id: string) {
        return (
            (
                await this.#select(
                    `SELECT t.*, ${timestamps('t')}, ${updated('t')} FROM tasks t WHERE ${this.#scope('t')} AND t.id = $id`,
                    { id }
                )
            )[0] ?? null
        );
    }
    #filter(projectId: string, filter: TaskFilter) {
        const clauses = [this.#scope('t'), 't.project_id = $project'];
        const bind: Record<string, unknown> = { project: projectId };

        const fields = {
            statusId: 'status_id',
            assigneeId: 'assignee_id',
            priority: 'priority',
            dueDateFrom: 'due_date',
            dueDateTo: 'due_date',
        };

        for (const [key, column] of Object.entries(fields)) {
            const value = filter[key as keyof TaskFilter];
            if (value != null) {
                clauses.push(
                    `t.${column} ${key === 'dueDateFrom' ? '>=' : key === 'dueDateTo' ? '<=' : '='} $${key}`
                );
                bind[key] = value;
            }
        }
        if (filter.unassigned === true) {
            clauses.push('t.assignee_id IS NULL');
        }
        if (filter.unassigned === false) {
            clauses.push('t.assignee_id IS NOT NULL');
        }
        return { where: clauses.join(' AND '), bind };
    }
    tasks(projectId: string, filter: TaskFilter, first: number, cursor: Cursor | null) {
        const { where, bind } = this.#filter(projectId, filter);
        return this.#select(
            `SELECT t.*, ${timestamps('t')}, ${updated('t')} FROM tasks t WHERE ${where}
          ${cursor ? 'AND (t.created_at, t.id) > ($time::timestamptz, $id::uuid)' : ''}
          ORDER BY t.created_at, t.id LIMIT $limit`,
            { ...bind, limit: first + 1, time: cursor?.time, id: cursor?.id }
        );
    }
    summary(projectId: string, filter: TaskFilter) {
        const { where, bind } = this.#filter(projectId, filter);
        return this.#select(
            `WITH matching AS MATERIALIZED (
            SELECT t.*, s.is_done, (transaction_timestamp() AT TIME ZONE o.time_zone)::date AS today
            FROM tasks t JOIN organizations o ON o.id = t.organization_id
            JOIN task_statuses s ON s.organization_id = t.organization_id AND s.project_id = t.project_id AND s.id = t.status_id
            WHERE ${where})
          SELECT 'total' AS dimension, NULL::text AS key, count(*)::int AS count,
            count(*) FILTER (WHERE due_date < today AND NOT is_done)::int AS overdue FROM matching
          UNION ALL SELECT 'status', status_id::text, count(*)::int, 0 FROM matching GROUP BY status_id
          UNION ALL SELECT 'assignee', assignee_id::text, count(*)::int, 0 FROM matching GROUP BY assignee_id
          UNION ALL SELECT 'priority', priority::text, count(*)::int, 0 FROM matching GROUP BY priority`,
            bind
        );
    }
    async history(relation: Relation, requests: HistoryRequest[]): Promise<Row[][]> {
        const table = relation === 'comments' ? 'task_comments' : 'task_activity';

        const rows = await this.#select(
            `SELECT request.ordinal, child.* FROM
          jsonb_to_recordset($requests::jsonb) AS request(ordinal int, task_id uuid, page_size int, after_time timestamptz, after_id uuid)
          CROSS JOIN LATERAL (SELECT h.id, h.organization_id, h.task_id,
            ${relation === 'comments' ? 'h.author_id, h.body, ' + updated('h') : 'h.actor_id, h.action, h.changes'}, ${timestamps('h')}
            FROM ${table} h WHERE ${this.#scope('h')} AND h.task_id = request.task_id
            AND (request.after_time IS NULL OR (h.created_at, h.id) > (request.after_time, request.after_id))
            ORDER BY h.created_at, h.id LIMIT request.page_size + 1) child
          ORDER BY request.ordinal, child.created_at, child.id`,
            {
                requests: JSON.stringify(
                    requests.map((r, ordinal) => ({
                        ordinal,
                        task_id: r.taskId,
                        page_size: r.first,
                        after_time: r.cursor?.time ?? null,
                        after_id: r.cursor?.id ?? null,
                    }))
                ),
            }
        );

        return requests.map((_, ordinal) => rows.filter((row) => row.ordinal === ordinal));
    }
}

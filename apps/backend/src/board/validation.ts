import { createHash } from 'node:crypto';
import { badInput } from './errors.js';
import { PRIORITIES, type Cursor, type TaskFilter } from './types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(value: string): string {
    if (!UUID.test(value)) {
        throw badInput('Invalid identifier');
    }
    return value.toLowerCase();
}
export function date(value: unknown): string {
    if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        value < '0001-01-01' ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value
    ) {
        throw badInput('Invalid calendar date');
    }
    return value;
}
export function pageSize(value?: number | null): number {
    const size = value ?? 25;
    if (!Number.isInteger(size) || size < 1 || size > 100) {
        throw badInput('Page size must be 1–100');
    }
    return size;
}
export function normalizeFilter(input?: TaskFilter | null): TaskFilter {
    const filter: TaskFilter = {};
    if (input?.statusId != null) {
        filter.statusId = uuid(input.statusId);
    }
    if (input?.assigneeId != null) {
        filter.assigneeId = uuid(input.assigneeId);
    }
    if (input?.unassigned != null) {
        filter.unassigned = input.unassigned;
    }
    if (input?.priority != null) {
        if (!(PRIORITIES as readonly string[]).includes(input.priority)) {
            throw badInput('Invalid priority');
        }
        filter.priority = input.priority;
    }
    if (input?.dueDateFrom != null) {
        filter.dueDateFrom = date(input.dueDateFrom);
    }
    if (input?.dueDateTo != null) {
        filter.dueDateTo = date(input.dueDateTo);
    }
    if (filter.unassigned && filter.assigneeId) {
        throw badInput('Assignee and unassigned filters conflict');
    }
    if (filter.dueDateFrom && filter.dueDateTo && filter.dueDateFrom > filter.dueDateTo) {
        throw badInput('Invalid due-date range');
    }
    return filter;
}
export function cursorScope(...parts: unknown[]): string {
    return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
export function encodeCursor(cursor: Cursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}
export function decodeCursor(value: string | null | undefined, scope: string): Cursor | null {
    if (value == null) {
        return null;
    }
    try {
        if (value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) {
            throw Error();
        }
        const cursor: Cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
        if (
            cursor.scope !== scope ||
            typeof cursor.time !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.time) ||
            !Number.isFinite(Date.parse(cursor.time))
        ) {
            throw Error();
        }
        uuid(cursor.id);
        date(cursor.time.slice(0, 10));
        return cursor;
    } catch {
        throw badInput('Invalid cursor for this query');
    }
}

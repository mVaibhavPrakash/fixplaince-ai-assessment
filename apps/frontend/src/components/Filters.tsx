import { useState, type FormEvent } from 'react';
import '../styles/filters.css';
import { PRIORITIES, type Member, type Priority, type TaskFilter, type TaskStatus } from '../types';

export function Filters({
    statuses,
    members,
    applied,
    onApply,
}: {
    statuses: TaskStatus[];
    members: Member[];
    applied: TaskFilter;
    onApply: (filter: TaskFilter) => void;
}) {
    const [draft, setDraft] = useState({
        statusId: applied.statusId ?? '',
        assignee: applied.unassigned ? 'unassigned' : (applied.assigneeId ?? ''),
        priority: applied.priority ?? '',
        dueDateFrom: applied.dueDateFrom ?? '',
        dueDateTo: applied.dueDateTo ?? '',
    });

    const [error, setError] = useState('');

    function submit(event: FormEvent) {
        event.preventDefault();
        if (draft.dueDateFrom && draft.dueDateTo && draft.dueDateFrom > draft.dueDateTo) {
            setError('The due-from date must be on or before the due-to date.');
            return;
        }
        setError('');
        const filter: TaskFilter = {};
        if (draft.statusId) {
            filter.statusId = draft.statusId;
        }
        if (draft.assignee === 'unassigned') {
            filter.unassigned = true;
        } else if (draft.assignee) {
            filter.assigneeId = draft.assignee;
        }
        if (draft.priority) {
            filter.priority = draft.priority as Priority;
        }
        if (draft.dueDateFrom) {
            filter.dueDateFrom = draft.dueDateFrom;
        }
        if (draft.dueDateTo) {
            filter.dueDateTo = draft.dueDateTo;
        }
        onApply(filter);
    }

    const change = (field: keyof typeof draft, value: string) =>
        setDraft((previous) => ({ ...previous, [field]: value }));

    return (
        <form id="filters" className="filters" onSubmit={submit} aria-label="Task filters">
            <label>
                Status
                <select
                    value={draft.statusId}
                    onChange={(event) => change('statusId', event.target.value)}
                >
                    <option value="">All statuses</option>
                    {statuses.map((status) => (
                        <option key={status.id} value={status.id}>
                            {status.name}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Assignee
                <select
                    value={draft.assignee}
                    onChange={(event) => change('assignee', event.target.value)}
                >
                    <option value="">Everyone</option>
                    <option value="unassigned">Unassigned</option>
                    {members.map((member) => (
                        <option key={member.user.id} value={member.user.id}>
                            {member.user.displayName}
                            {!member.isActive || !member.user.isActive ? ' (inactive)' : ''}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Priority
                <select
                    value={draft.priority}
                    onChange={(event) => change('priority', event.target.value)}
                >
                    <option value="">All priorities</option>
                    {PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                            {priority[0] + priority.slice(1).toLowerCase()}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Due from
                <input
                    type="date"
                    value={draft.dueDateFrom}
                    onChange={(event) => change('dueDateFrom', event.target.value)}
                />
            </label>
            <label>
                Due to
                <input
                    type="date"
                    value={draft.dueDateTo}
                    onChange={(event) => change('dueDateTo', event.target.value)}
                />
            </label>
            <div className="filter-actions">
                <button className="button primary" type="submit">
                    Apply filters
                </button>
                <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                        setDraft({
                            statusId: '',
                            assignee: '',
                            priority: '',
                            dueDateFrom: '',
                            dueDateTo: '',
                        });
                        setError('');
                        onApply({});
                    }}
                >
                    Clear
                </button>
            </div>
            {error && (
                <p role="alert" className="filter-error">
                    {error}
                </p>
            )}
        </form>
    );
}

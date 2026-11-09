import type { ColumnState, Task, TaskStatus, TaskSummary } from '../types';
import '../styles/board.css';

function TaskCard({ task }: { task: Task }) {
    const name = task.assignee?.user.displayName ?? 'Unassigned';
    const inactive = task.assignee && (!task.assignee.isActive || !task.assignee.user.isActive);

    const due = task.dueDate
        ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
              new Date(task.dueDate + 'T00:00:00Z')
          )
        : null;

    return (
        <article className="task-card" aria-label={task.title}>
            <div className="card-meta">
                <span className="task-reference">#{task.id.slice(-4).toUpperCase()}</span>
                <span className="priority-badge">
                    {task.priority[0] + task.priority.slice(1).toLowerCase()}
                </span>
            </div>
            <h3>{task.title}</h3>
            {task.description && <p className="task-description">{task.description}</p>}
            {!!task.labels.length && (
                <div className="task-labels">
                    {task.labels.map((label) => (
                        <span key={label.id}>{label.name}</span>
                    ))}
                </div>
            )}
            <div className="card-footer">
                <div className="assignee" title={name}>
                    <span>
                        {name}
                        {inactive ? ' (inactive)' : ''}
                    </span>
                </div>
                {due && (
                    <time dateTime={task.dueDate!} className="due-date" aria-label={`Due ${due}`}>
                        {due}
                    </time>
                )}
            </div>
        </article>
    );
}

export function Board({
    statuses,
    columns,
    summary,
    onMore,
}: {
    statuses: TaskStatus[];
    columns: Record<string, ColumnState>;
    summary: TaskSummary;
    onMore: (id: string) => void;
}) {
    const busy = Object.values(columns).some((column) => column.loading);
    return (
        <section id="board" aria-label="Task board columns">
            {summary.total === 0 && (
                <div className="empty-board">
                    <strong>No tasks match these filters</strong>
                    <span>Try a different status, assignee, priority, or date range.</span>
                </div>
            )}
            <div className="kanban" role="group" aria-label="Scrollable task columns" tabIndex={0}>
                {statuses.map((status) => {
                    const column = columns[status.id];

                    const count =
                        summary.byStatus.find((item) => item.status.id === status.id)?.count ?? 0;

                    return (
                        <section
                            key={status.id}
                            className="kanban-column"
                            aria-label={`${status.name} column`}
                        >
                            <header className="column-header">
                                <h2>{status.name}</h2>
                                <span className="column-count">{count}</span>
                                {status.isDone && (
                                    <span className="done-mark" aria-label="Completed status">
                                        ✓
                                    </span>
                                )}
                            </header>
                            <div
                                className="column-tasks"
                                role="group"
                                aria-label={`${status.name} tasks`}
                                tabIndex={0}
                            >
                                {column?.tasks.map((task) => (
                                    <TaskCard key={task.id} task={task} />
                                ))}
                                {!column?.tasks.length && (
                                    <p className="empty-column">Nothing here yet</p>
                                )}
                            </div>
                            <footer className="column-footer">
                                <span>
                                    {column?.tasks.length ?? 0} of {count} loaded
                                </span>
                                {column?.error && <p role="alert">{column.error}</p>}
                                {column?.hasNextPage && (
                                    <button
                                        className="load-more"
                                        disabled={busy}
                                        onClick={() => onMore(status.id)}
                                        aria-label={`Load more ${status.name} tasks`}
                                    >
                                        {column.loading
                                            ? 'Loading…'
                                            : column.error
                                              ? 'Retry loading'
                                              : 'Load more'}{' '}
                                        <span aria-hidden="true">↓</span>
                                    </button>
                                )}
                            </footer>
                        </section>
                    );
                })}
            </div>
        </section>
    );
}

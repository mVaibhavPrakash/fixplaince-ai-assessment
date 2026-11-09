import { PRIORITIES, type TaskSummary } from '../types';
import '../styles/overview.css';

export function Summary({ summary }: { summary: TaskSummary }) {
    const completed = summary.byStatus
        .filter((item) => item.status.isDone)
        .reduce((sum, item) => sum + item.count, 0);

    const maxCount = Math.max(1, ...summary.byStatus.map((item) => item.count));
    return (
        <section id="overview" aria-label="Project overview" className="overview">
            <div className="metrics">
                <div className="metric">
                    <span>Total matching</span>
                    <strong aria-label="Total matching tasks">{summary.total}</strong>
                    <span className="metric-note">Across all pages</span>
                </div>
                <div className="metric">
                    <span>Overdue</span>
                    <strong className="overdue-number" aria-label="Overdue tasks">
                        {summary.overdue}
                    </strong>
                    <span className="metric-note">Open tasks past their due date</span>
                </div>
                <div className="metric">
                    <span>Completed</span>
                    <strong aria-label="Completed tasks">{completed}</strong>
                    <span className="metric-note">
                        {summary.total ? Math.round((completed / summary.total) * 100) : 0}% of
                        matching tasks
                    </span>
                </div>
            </div>
            <div className="insights">
                <figure aria-label="Tasks by status" className="status-chart">
                    <figcaption>
                        <span>Workflow distribution</span>
                        <span className="subtle">Tasks by status</span>
                    </figcaption>
                    <div className="chart-rows">
                        {summary.byStatus.map((item) => (
                            <div className="chart-row" key={item.status.id}>
                                <span className="chart-label" title={item.status.name}>
                                    {item.status.name}
                                </span>
                                <span className="chart-track">
                                    <span
                                        className="chart-bar"
                                        style={{ width: `${(item.count / maxCount) * 100}%` }}
                                    />
                                </span>
                                <strong>{item.count}</strong>
                            </div>
                        ))}
                    </div>
                </figure>
                <section aria-label="Priority distribution" className="priority-summary">
                    <h2>Priority distribution</h2>
                    <div className="priority-grid">
                        {PRIORITIES.map((priority) => (
                            <div key={priority}>
                                <span className="priority-label">
                                    <span aria-hidden="true">●</span>{' '}
                                    {priority[0] + priority.slice(1).toLowerCase()}
                                </span>
                                <strong>
                                    {summary.byPriority.find((item) => item.priority === priority)
                                        ?.count ?? 0}
                                </strong>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </section>
    );
}

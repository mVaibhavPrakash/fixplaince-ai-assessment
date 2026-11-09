import { useRootContext } from '../context/RootContext';
import { Summary } from './Summary';
import { Board } from './Board';
import { StatePanel } from './StatePanel';

export function TaskBoardContent() {
    const { organization, workspace, taskBoard, refresh } = useRootContext();
    const { organizations } = organization;
    let state: { title: string; detail?: string; error?: boolean; loading?: boolean } | null = null;
    if (organization.directory.loading) {
        state = { title: 'Loading organizations…', loading: true };
    } else if (organization.directory.error) {
        state = {
            title: 'Could not load organizations',
            detail: organization.directory.error,
            error: true,
        };
    } else if (!organizations.length) {
        state = {
            title: 'No organizations yet',
            detail: 'Refresh after an organization has been added.',
        };
    } else if (!organization.identity.userId) {
        state = {
            title: 'No active users in this organization',
            detail: 'Choose another organization to view its board.',
        };
    } else if (workspace.workspaceError) {
        state = {
            title: 'Could not load this workspace',
            detail: workspace.workspaceError,
            error: true,
        };
    } else if (workspace.workspaceLoading) {
        state = { title: 'Loading workspace…', loading: true };
    } else if (!workspace.project) {
        state = {
            title: 'No projects in this organization',
            detail: 'There are no project boards to show yet.',
        };
    } else if (taskBoard.board.error) {
        state = { title: 'Could not load the board', detail: taskBoard.board.error, error: true };
    } else if (taskBoard.board.loading) {
        state = { title: 'Loading tasks…', loading: true };
    }

    const statuses =
        workspace.project?.statuses.filter(
            (status) => !taskBoard.filter.statusId || taskBoard.filter.statusId === status.id
        ) ?? [];

    if (state) {
        return <StatePanel {...state} onRetry={refresh} />;
    }
    if (!taskBoard.board.summary) {
        return null;
    }
    return (
        <>
            <Summary summary={taskBoard.board.summary} />
            <div className="board-heading">
                <div>
                    <h2>Project board</h2>
                    <span>{statuses.length} workflow columns</span>
                </div>
                <span className="sort-label">
                    Oldest first <span aria-hidden="true">↓</span>
                </span>
            </div>
            {statuses.length ? (
                <Board
                    statuses={statuses}
                    columns={taskBoard.board.columns}
                    summary={taskBoard.board.summary}
                    onMore={taskBoard.loadMore}
                />
            ) : (
                <StatePanel
                    title="No statuses configured"
                    detail="This project needs workflow statuses before tasks can be displayed."
                />
            )}
        </>
    );
}

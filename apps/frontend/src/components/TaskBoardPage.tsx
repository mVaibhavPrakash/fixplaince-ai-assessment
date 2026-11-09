import { useRootContext } from '../context/RootContext';
import { Topbar } from './Topbar';
import { PageHeading } from './PageHeading';
import { ProjectSelector } from './ProjectSelector';
import { TaskBoardContent } from './TaskBoardContent';
import { Filters } from './Filters';

export function TaskBoardPage() {
    const { organization, workspace, taskBoard } = useRootContext();
    return (
        <div className="app-layout">
            <a href="#main" className="skip-link">
                Skip to task board
            </a>
            <div className="main-shell">
                <Topbar />
                <main id="main">
                    <PageHeading />
                    <ProjectSelector />
                    {workspace.project && (
                        <Filters
                            key={`${organization.identity.organizationId}:${workspace.projectId}`}
                            statuses={workspace.project.statuses}
                            members={workspace.workspace!.members}
                            applied={taskBoard.filter}
                            onApply={taskBoard.applyFilter}
                        />
                    )}
                    <TaskBoardContent />
                    <footer className="page-footer">Read-only project task board</footer>
                </main>
            </div>
        </div>
    );
}

import { createContext, useContext, type ReactNode } from 'react';
import type { BoardApi } from '../types';
import { OrganizationProvider, useOrganization } from './OrganizationContext';
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext';
import { TaskBoardProvider, useTaskBoard } from './TaskBoardContext';

export { OrganizationContext, OrganizationProvider, useOrganization } from './OrganizationContext';
export { WorkspaceContext, WorkspaceProvider, useWorkspace } from './WorkspaceContext';
export { TaskBoardContext, TaskBoardProvider, useTaskBoard } from './TaskBoardContext';

function useRootState() {
    const organization = useOrganization(),
        workspace = useWorkspace(),
        taskBoard = useTaskBoard();

    function refresh() {
        if (
            organization.directory.error ||
            !organization.organizations.length ||
            !organization.identity.userId
        ) {
            organization.reloadDirectory();
        } else {
            workspace.refreshWorkspace();
        }
    }

    return {
        organization,
        workspace,
        taskBoard,
        refresh,
        loading:
            organization.directory.loading || workspace.workspaceLoading || taskBoard.board.loading,
    };
}

export const RootContext = createContext<ReturnType<typeof useRootState> | null>(null);

function ExposeContexts({ children }: { children: ReactNode }) {
    const value = useRootState();
    return <RootContext.Provider value={value}>{children}</RootContext.Provider>;
}

function ProjectScope({ api, children }: { api: BoardApi; children: ReactNode }) {
    const { projectId } = useWorkspace();
    return (
        <TaskBoardProvider key={projectId} api={api}>
            <ExposeContexts>{children}</ExposeContexts>
        </TaskBoardProvider>
    );
}

function WorkspaceScope({ api, children }: { api: BoardApi; children: ReactNode }) {
    const { identity } = useOrganization();
    return (
        <WorkspaceProvider key={JSON.stringify(identity)} api={api}>
            <ProjectScope api={api}>{children}</ProjectScope>
        </WorkspaceProvider>
    );
}

export function RootProvider({ api, children }: { api: BoardApi; children: ReactNode }) {
    return (
        <OrganizationProvider api={api}>
            <WorkspaceScope api={api}>{children}</WorkspaceScope>
        </OrganizationProvider>
    );
}

export function useRootContext() {
    const context = useContext(RootContext);
    if (!context) {
        throw Error('useRootContext requires RootProvider');
    }
    return context;
}

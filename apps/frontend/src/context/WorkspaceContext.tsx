import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { BoardApi, Workspace } from '../types';
import { useOrganization } from './OrganizationContext';
import { errorMessage, type Remote } from './state';

function useWorkspaceState(api: BoardApi) {
    const { identity } = useOrganization();

    const [state, setWorkspace] = useState<Remote<Workspace> & { key: string }>({
        key: '',
        data: null,
        loading: false,
        error: null,
    });

    const [projectId, setProjectId] = useState('');
    const [revision, setRevision] = useState(0);
    const workspaceKey = JSON.stringify([identity, revision]);
    const workspace = state.key === workspaceKey ? state.data : null;
    useEffect(() => {
        if (!identity.organizationId || !identity.userId) {
            return;
        }
        const controller = new AbortController();
        setWorkspace({ key: workspaceKey, data: null, loading: true, error: null });
        api.workspace(identity, controller.signal)
            .then((data) => {
                if (controller.signal.aborted) {
                    return;
                }
                setWorkspace({ key: workspaceKey, data, loading: false, error: null });
                setProjectId((previous) =>
                    data.projects.some((item) => item.id === previous)
                        ? previous
                        : (data.projects[0]?.id ?? '')
                );
            })
            .catch((error) => {
                if (!controller.signal.aborted) {
                    setWorkspace({
                        key: workspaceKey,
                        data: null,
                        loading: false,
                        error: errorMessage(error),
                    });
                }
            });
        return () => controller.abort();
    }, [api, workspaceKey]);
    return {
        workspace,
        workspaceKey,
        projectId,
        selectProject: setProjectId,
        project: workspace?.projects.find((item) => item.id === projectId) ?? null,
        workspaceLoading: state.key !== workspaceKey || state.loading,
        workspaceError: state.key === workspaceKey ? state.error : null,
        refreshWorkspace: () => setRevision((value) => value + 1),
    };
}

export const WorkspaceContext = createContext<ReturnType<typeof useWorkspaceState> | null>(null);
export function WorkspaceProvider({ api, children }: { api: BoardApi; children: ReactNode }) {
    const value = useWorkspaceState(api);
    return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
export function useWorkspace() {
    const context = useContext(WorkspaceContext);
    if (!context) {
        throw Error('useWorkspace requires WorkspaceProvider');
    }
    return context;
}

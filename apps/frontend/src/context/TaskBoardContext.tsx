import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { BoardApi, ColumnState, TaskFilter, TaskSummary } from '../types';
import { useOrganization } from './OrganizationContext';
import { useWorkspace } from './WorkspaceContext';
import { columnState, mergePage } from './pagination';
import { errorMessage } from './state';

interface BoardState {
    key: string;
    loading: boolean;
    error: string | null;
    columns: Record<string, ColumnState>;
    summary: TaskSummary | null;
}

function useBoardState(api: BoardApi) {
    const { identity } = useOrganization();
    const { workspaceKey, projectId, project } = useWorkspace();
    const [filter, setFilter] = useState<TaskFilter>({});

    const [boardState, setBoard] = useState<BoardState>({
        key: '',
        loading: false,
        error: null,
        columns: {},
        summary: null,
    });

    const pages = useRef(new Map<string, AbortController>());
    const key = JSON.stringify([workspaceKey, projectId, filter]);

    const board: BoardState =
        boardState.key === key
            ? boardState
            : { key, loading: !!project, error: null, columns: {}, summary: null };

    useEffect(() => {
        if (!project || !identity.userId) {
            return;
        }
        const controller = new AbortController();
        setBoard({ key, loading: true, error: null, columns: {}, summary: null });

        const statusIds = project.statuses
            .filter((status) => !filter.statusId || status.id === filter.statusId)
            .map((status) => status.id);

        api.board({ identity, projectId, filter, statusIds }, controller.signal)
            .then((data) => {
                if (controller.signal.aborted) {
                    return;
                }
                setBoard({
                    key,
                    loading: false,
                    error: null,
                    summary: data.summary,
                    columns: Object.fromEntries(
                        Object.entries(data.columns).map(([id, connection]) => [
                            id,
                            columnState(connection),
                        ])
                    ),
                });
            })
            .catch((error) => {
                if (!controller.signal.aborted) {
                    setBoard({
                        key,
                        loading: false,
                        error: errorMessage(error),
                        columns: {},
                        summary: null,
                    });
                }
            });
        return () => {
            controller.abort();
            pages.current.forEach((page) => page.abort());
            pages.current.clear();
        };
    }, [api, key, project]); // key captures identity, project, applied filters and refresh.

    async function loadMore(statusId: string) {
        const column = board.columns[statusId];
        if (!column?.hasNextPage || !column.endCursor || pages.current.size) {
            return;
        }
        const controller = new AbortController();
        pages.current.set(statusId, controller);
        setBoard((previous) =>
            previous.key !== key
                ? previous
                : {
                      ...previous,
                      columns: {
                          ...previous.columns,
                          [statusId]: { ...column, loading: true, error: null },
                      },
                  }
        );
        try {
            const result = await api.page(
                { identity, projectId, filter, statusId, after: column.endCursor },
                controller.signal
            );

            if (!controller.signal.aborted) {
                setBoard((previous) =>
                    previous.key !== key
                        ? previous
                        : {
                              ...previous,
                              summary: result.taskSummary,
                              columns: mergePage(previous.columns, statusId, result.tasks),
                          }
                );
            }
        } catch (error) {
            if (!controller.signal.aborted) {
                setBoard((previous) =>
                    previous.key !== key
                        ? previous
                        : {
                              ...previous,
                              columns: {
                                  ...previous.columns,
                                  [statusId]: {
                                      ...previous.columns[statusId],
                                      loading: false,
                                      error: errorMessage(error),
                                  },
                              },
                          }
                );
            }
        } finally {
            if (pages.current.get(statusId) === controller) {
                pages.current.delete(statusId);
            }
        }
    }

    return { filter, board, applyFilter: setFilter, loadMore };
}

export const TaskBoardContext = createContext<ReturnType<typeof useBoardState> | null>(null);

export function TaskBoardProvider({ api, children }: { api: BoardApi; children: ReactNode }) {
    const value = useBoardState(api);
    return <TaskBoardContext.Provider value={value}>{children}</TaskBoardContext.Provider>;
}

export function useTaskBoard() {
    const value = useContext(TaskBoardContext);
    if (!value) {
        throw Error('useTaskBoard requires TaskBoardProvider');
    }
    return value;
}

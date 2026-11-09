import type { ColumnState, TaskConnection } from '../types';
export const columnState = (connection: TaskConnection): ColumnState => ({
    tasks: [...new Map(connection.edges.map((edge) => [edge.node.id, edge.node])).values()],
    ...connection.pageInfo,
    loading: false,
    error: null,
});

// Reconcile server pages by ID/version, including a task observed in another column.
export function mergePage(
    columns: Record<string, ColumnState>,
    statusId: string,
    connection: TaskConnection
) {
    const latest = new Map(
        Object.values(columns)
            .flatMap((column) => column.tasks)
            .map((task) => [task.id, task])
    );

    for (const { node } of connection.edges) {
        const previous = latest.get(node.id);
        if (!previous || node.version >= previous.version) {
            latest.set(node.id, node);
        }
    }
    return Object.fromEntries(
        Object.entries(columns).map(([id, column]) => {
            const ids = new Set(column.tasks.map((task) => task.id));
            if (id === statusId) {
                connection.edges.forEach((edge) => ids.add(edge.node.id));
            }
            return [
                id,
                {
                    ...column,
                    ...(id === statusId ? connection.pageInfo : {}),
                    tasks: [...ids]
                        .map((key) => latest.get(key)!)
                        .filter((task) => task.status.id === id),
                    loading: false,
                    error: null,
                },
            ];
        })
    );
}

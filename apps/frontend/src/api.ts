import type {
    BoardApi,
    BoardData,
    Identity,
    PageData,
    TaskConnection,
    TaskSummary,
    Workspace,
    Organization,
} from './types';

const PAGE_SIZE = 25;
const STATUS_FIELDS = 'id name position isDone';

const TASK_FIELDS = `id title description priority position version dueDate
    status { ${STATUS_FIELDS} } labels { id name }
    assignee { role isActive user { id displayName isActive } }`;

const SUMMARY_FIELDS = `total overdue byStatus { status { ${STATUS_FIELDS} } count } byPriority { priority count }`;
const CONNECTION_FIELDS = `edges { cursor node { ${TASK_FIELDS} } } pageInfo { endCursor hasNextPage }`;

export function createApi(
    endpoint = '/graphql',
    fetcher: typeof fetch = globalThis.fetch
): BoardApi {
    async function request<T>(
        query: string,
        variables: Record<string, unknown>,
        signal: AbortSignal,
        identity?: Identity
    ): Promise<T> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (identity) {
            headers['x-tenant-id'] = identity.organizationId;
            headers['x-user-id'] = identity.userId;
        }
        let response: Response;
        try {
            response = await fetcher(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({ query, variables }),
                signal,
            });
        } catch (error) {
            if (signal.aborted) {
                throw error;
            }
            throw Error('Could not reach the server. Check that the backend is running.');
        }
        if (response.status === 401 || response.status === 403) {
            throw Error('This selection is unavailable. Choose another organization or user.');
        }
        if (!response.ok) {
            throw Error(`The request could not be completed (${response.status}). Try again.`);
        }
        let result: { data?: T; errors?: { message: string }[] };
        try {
            result = await response.json();
        } catch {
            throw Error('The server returned an invalid response.');
        }
        if (result.errors?.length) {
            throw Error(result.errors[0].message);
        }
        if (!result.data) {
            throw Error('The server returned no data.');
        }
        return result.data;
    }

    return {
        async organizations(signal) {
            return (
                await request<{ organizations: Organization[] }>(
                    `query Organizations {
                organizations { id name members { isActive user { id displayName isActive } } }
            }`,
                    {},
                    signal
                )
            ).organizations;
        },
        async workspace(identity, signal) {
            return (
                await request<{ organization: Workspace }>(
                    `query Workspace {
                organization { id name settings { timeZone } members { role isActive user { id displayName isActive } }
                  projects { id name description statuses { ${STATUS_FIELDS} } } }
            }`,
                    {},
                    signal,
                    identity
                )
            ).organization;
        },
        async board({ identity, projectId, filter, statusIds }, signal): Promise<BoardData> {
            // Fetch all initial column pages and the summary in one server snapshot.
            const variables: Record<string, unknown> = {
                projectId,
                filter,
                ...(statusIds.length ? { first: PAGE_SIZE } : {}),
            };

            const declarations = statusIds
                .map((_, index) => `$filter${index}:TaskFilter`)
                .join(',');

            const fields = statusIds
                .map((statusId, index) => {
                    variables[`filter${index}`] = { ...filter, statusId };
                    return `column${index}:tasks(projectId:$projectId,filter:$filter${index},first:$first){${CONNECTION_FIELDS}}`;
                })
                .join('\n');

            const data = await request<
                Record<string, TaskConnection> & { taskSummary: TaskSummary }
            >(
                `query Board($projectId:ID!,$filter:TaskFilter${statusIds.length ? ',$first:Int!' : ''}${declarations ? ',' + declarations : ''}) {
                    ${fields} taskSummary(projectId:$projectId,filter:$filter){${SUMMARY_FIELDS}}
                }`,
                variables,
                signal,
                identity
            );

            return {
                columns: Object.fromEntries(
                    statusIds.map((id, index) => [id, data[`column${index}`]])
                ),
                summary: data.taskSummary,
            };
        },
        page({ identity, projectId, filter, statusId, after }, signal) {
            return request<PageData>(
                `query MoreTasks($projectId:ID!,$filter:TaskFilter,$columnFilter:TaskFilter,$first:Int!,$after:String) {
                tasks(projectId:$projectId,filter:$columnFilter,first:$first,after:$after){${CONNECTION_FIELDS}}
                taskSummary(projectId:$projectId,filter:$filter){${SUMMARY_FIELDS}}
            }`,
                {
                    projectId,
                    filter,
                    columnFilter: { ...filter, statusId },
                    first: PAGE_SIZE,
                    after,
                },
                signal,
                identity
            );
        },
    };
}

export const api = createApi(import.meta.env.VITE_GRAPHQL_ENDPOINT || '/graphql');

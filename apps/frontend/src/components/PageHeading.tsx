import { useRootContext } from '../context/RootContext';

export function PageHeading() {
    const model = useRootContext();
    const { loading } = model;
    return (
        <div className="page-heading">
            <div>
                <h1>
                    Task board <span className="read-only">Read only</span>
                </h1>
                <p>{model.workspace.project?.description || 'View tasks and project progress.'}</p>
            </div>
            <button
                className="button refresh"
                onClick={model.refresh}
                disabled={loading && !!model.organization.identity.userId}
            >
                Refresh
            </button>
        </div>
    );
}

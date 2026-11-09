interface StatePanelProps {
    title: string;
    detail?: string;
    error?: boolean;
    loading?: boolean;
    onRetry?: () => void;
}

export function StatePanel({ title, detail, error, loading, onRetry }: StatePanelProps) {
    return (
        <div
            className={`state-panel ${error ? 'state-error' : ''}`}
            role={error ? 'alert' : loading ? 'status' : undefined}
        >
            <h2>{title}</h2>
            {detail && <p>{detail}</p>}
            {error && onRetry && (
                <button className="button primary" onClick={onRetry}>
                    Try again
                </button>
            )}
        </div>
    );
}

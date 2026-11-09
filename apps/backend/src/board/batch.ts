// Request-local promise cache. No process-wide tenant data is retained.
export function createBatchLoader<K, V>(
    batch: (keys: K[]) => Promise<V[]>,
    keyOf: (key: K) => string = JSON.stringify
) {
    const cache = new Map<string, Promise<V>>();
    let queue: { key: K; resolve: (value: V) => void; reject: (error: unknown) => void }[] = [];
    return (key: K): Promise<V> => {
        const identity = keyOf(key);
        const cached = cache.get(identity);
        if (cached) {
            return cached;
        }

        const promise = new Promise<V>((resolve, reject) => {
            queue.push({ key, resolve, reject });
            if (queue.length === 1) {
                // Collect sibling resolver loads before issuing one batch.
                queueMicrotask(async () => {
                    const current = queue;
                    queue = [];
                    try {
                        const values = await batch(current.map((entry) => entry.key));
                        if (values.length !== current.length) {
                            throw Error('Invalid batch result');
                        }
                        // Batch results must follow the input key order, including missing records.
                        current.forEach((entry, index) => entry.resolve(values[index]));
                    } catch (error) {
                        current.forEach((entry) => entry.reject(error));
                    }
                });
            }
        });

        cache.set(identity, promise);
        return promise;
    };
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IdentityHeaders } from '../graphql/context.js';
import type { ApiResponse, Operation } from '../graphql/execute.js';
import { LOCAL_ORIGINS, MAX_BODY_BYTES } from './constants.js';

export function createHttpHandler(
    execute: (operation: Operation, headers: IdentityHeaders) => Promise<ApiResponse>
) {
    return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
        const origin = request.headers.origin;

        const cors =
            origin && LOCAL_ORIGINS.includes(origin)
                ? {
                      'access-control-allow-origin': origin,
                      vary: 'Origin',
                      'access-control-allow-methods': 'POST, OPTIONS',
                      'access-control-allow-headers': 'content-type, x-user-id, x-tenant-id',
                  }
                : {};

        const send = (status: number, body?: unknown) => {
            if (response.destroyed || response.writableEnded) {
                return;
            }
            response.writeHead(status, {
                'content-type': 'application/json; charset=utf-8',
                'cache-control': 'no-store',
                ...cors,
            });
            response.end(body === undefined ? '' : JSON.stringify(body));
        };

        const error = (status: number, message: string) =>
            send(status, {
                errors: [
                    {
                        message,
                        extensions: {
                            code:
                                status === 503
                                    ? 'INTERNAL_SERVER_ERROR'
                                    : status === 413
                                      ? 'PAYLOAD_TOO_LARGE'
                                      : 'BAD_REQUEST',
                        },
                    },
                ],
            });

        if (request.url !== '/graphql') {
            error(404, 'Not found');
            return;
        }
        if (origin && !LOCAL_ORIGINS.includes(origin)) {
            error(403, 'Origin denied');
            return;
        }
        if (request.method === 'OPTIONS') {
            send(204);
            return;
        }
        if (request.method !== 'POST') {
            error(405, 'Use POST');
            return;
        }
        if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
            error(415, 'Expected application/json');
            return;
        }
        try {
            let size = 0;
            const chunks: Buffer[] = [];
            for await (const chunk of request) {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                size += buffer.length;
                if (size > MAX_BODY_BYTES) {
                    error(413, 'Request body too large');
                    return;
                }
                chunks.push(buffer);
            }
            let body: unknown;
            try {
                body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
                error(400, 'Malformed JSON');
                return;
            }
            if (!body || typeof body !== 'object' || Array.isArray(body)) {
                error(400, 'Expected one GraphQL operation');
                return;
            }
            const input = body as Record<string, unknown>;
            if (
                typeof input.query !== 'string' ||
                input.query.trim() === '' ||
                (input.operationName != null && typeof input.operationName !== 'string') ||
                (input.variables != null &&
                    (typeof input.variables !== 'object' || Array.isArray(input.variables)))
            ) {
                error(400, 'Invalid GraphQL request');
                return;
            }

            const result = await execute(
                {
                    query: input.query,
                    variables: input.variables as Operation['variables'],
                    operationName: input.operationName as string | undefined,
                },
                request.headers
            );

            send(result.status, result.body);
        } catch {
            error(503, 'Service unavailable');
        }
    };
}

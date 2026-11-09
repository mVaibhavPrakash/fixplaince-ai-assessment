import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { expect, it, vi } from 'vitest';
import { createHttpHandler } from '../src/http/handler.js';

async function request(
    body: string,
    options: { method?: string; url?: string; headers?: Record<string, string> } = {}
) {
    const execute = vi.fn(async () => ({ status: 200, body: { data: { ok: true } } }));

    const req = Object.assign(Readable.from([Buffer.from(body)]), {
        method: 'POST',
        url: '/graphql',
        headers: { 'content-type': 'application/json', ...options.headers },
        ...options,
    });

    // Restore composed headers after spreading options.
    req.headers = { 'content-type': 'application/json', ...options.headers };

    let status = 0,
        result = '';

    const res = {
        writeHead: (code: number) => {
            status = code;
        },
        end: (text = '') => {
            result = text;
        },
    };

    await createHttpHandler(execute)(req as IncomingMessage, res as unknown as ServerResponse);
    return { status, result, execute };
}

it('accepts a JSON GraphQL operation and passes identity headers', async () => {
    const { status, execute } = await request(
        JSON.stringify({ query: '{ organization { id } }' }),
        { headers: { 'x-user-id': 'a' } }
    );

    expect(status).toBe(200);
    expect(execute).toHaveBeenCalledWith(
        { query: '{ organization { id } }' },
        expect.objectContaining({ 'x-user-id': 'a' })
    );
});
it.each(['{broken', '[]', '{}', '{"query":1}', '{"query":"{x}","variables":[]}'])(
    'rejects invalid payload %s',
    async (body) => {
        const result = await request(body);
        expect(result.status).toBe(400);
        expect(JSON.parse(result.result).errors[0].extensions.code).toBe('BAD_REQUEST');
        expect(result.execute).not.toHaveBeenCalled();
    }
);
it('rejects unsupported origins and non-JSON requests', async () => {
    expect((await request('{}', { headers: { origin: 'https://foreign.example' } })).status).toBe(
        403
    );
    expect((await request('{}', { headers: { 'content-type': 'text/plain' } })).status).toBe(415);
});
it('allows frontend CORS preflight without executing GraphQL', async () => {
    const result = await request('', {
        method: 'OPTIONS',
        headers: { origin: 'http://127.0.0.1:5173' },
    });

    expect(result.status).toBe(204);
    expect(result.execute).not.toHaveBeenCalled();
});

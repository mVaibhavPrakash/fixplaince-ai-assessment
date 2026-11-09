import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { ApolloServer } from '@apollo/server';
import type { Sequelize } from 'sequelize';
import type { AppConfig } from './config/types.js';
import { resolvers } from './graphql/resolvers.js';
import type { ResolverContext } from './graphql/types.js';
import { executeRequest } from './graphql/execute.js';
import { createHttpHandler } from './http/handler.js';

export async function startApi(
    database: Pick<Sequelize, 'query' | 'transaction'>,
    config: Pick<AppConfig, 'host' | 'port'>
) {
    const apollo = new ApolloServer<ResolverContext>({
        typeDefs: await readFile(
            new URL('../../../graphql/schema.graphql', import.meta.url),
            'utf8'
        ),
        resolvers,
        includeStacktraceInErrorResponses: false,
        formatError(error) {
            const code = String(error.extensions?.code ?? 'INTERNAL_SERVER_ERROR');

            const expected = [
                'BAD_USER_INPUT',
                'UNAUTHENTICATED',
                'FORBIDDEN',
                'GRAPHQL_PARSE_FAILED',
                'GRAPHQL_VALIDATION_FAILED',
                'BAD_REQUEST',
            ];

            return {
                message: expected.includes(code) ? error.message : 'Service unavailable',
                path: error.path,
                locations: error.locations,
                extensions: { code },
            };
        },
    });

    await apollo.start();

    const http = createServer(
        createHttpHandler((operation, headers) =>
            executeRequest(apollo, database, operation, headers)
        )
    );

    http.requestTimeout = 30_000;
    http.headersTimeout = 15_000;
    try {
        await new Promise<void>((resolve, reject) => {
            http.once('error', reject);
            http.listen(config.port, config.host, () => {
                http.off('error', reject);
                resolve();
            });
        });
    } catch {
        await apollo.stop();
        throw Error('Unable to start API');
    }
    return {
        async close() {
            await new Promise<void>((resolve, reject) =>
                http.close((error) => (error ? reject(error) : resolve()))
            );
            await apollo.stop();
        },
    };
}

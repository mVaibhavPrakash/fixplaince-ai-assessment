import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());

describe('backend startup', () => {
    const env = {
        PG_HOST: '127.0.0.1',
        PG_PORT: '5432',
        PG_USERNAME: 'reader',
        PG_PASSWORD: 'private-password',
        PG_DATABASE: 'taskboard',
        PG_TEST_DATABASE: 'taskboard_test',
    };

    it('configures one connection and authenticates once, including concurrent callers', async () => {
        const { initializeBackend } = await import('../src/startup.js');

        const database = {
            authenticate: vi.fn().mockResolvedValue(undefined),
            close: vi.fn(),
            query: vi.fn(),
            transaction: vi.fn(),
        };

        const createDatabase = vi.fn(() => database);
        const options = { env, loadEnvironment: vi.fn(), createDatabase };

        const [first, second] = await Promise.all([
            initializeBackend(options),
            initializeBackend(options),
        ]);

        expect(first).toBe(second);
        expect(createDatabase).toHaveBeenCalledTimes(1);
        expect(createDatabase).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'taskboard', username: 'taskboard_runtime' })
        );
        expect(database.authenticate).toHaveBeenCalledTimes(1);
    });
});

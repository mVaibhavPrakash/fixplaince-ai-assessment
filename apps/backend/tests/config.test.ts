import { beforeEach, describe, expect, it, vi } from 'vitest';

const environment = () => ({
    PORT: '4000',
    PG_HOST: '127.0.0.1',
    PG_PORT: '5432',
    PG_USERNAME: 'reader',
    PG_PASSWORD: 'private-password',
    PG_DATABASE: 'taskboard',
    PG_TEST_DATABASE: 'taskboard_test',
});

beforeEach(() => vi.resetModules());

describe('configuration initialization', () => {
    it('rejects access before explicit initialization', async () => {
        const { getConfig } = await import('../src/config/config.js');
        expect(() => getConfig()).toThrow('Configuration has not been initialized');
    });

    it('loads the environment before reading it and initializes once', async () => {
        const { initializeConfig, getConfig } = await import('../src/config/config.js');
        const env = environment();

        const loadEnvironment = vi.fn(() => {
            env.PORT = '4100';
        });

        const config = initializeConfig({ env, loadEnvironment });
        expect(config).toMatchObject({
            host: '127.0.0.1',
            port: 4100,
            database: { host: '127.0.0.1', port: 5432, name: 'taskboard', username: 'reader' },
        });
        expect(getConfig()).toBe(config);
        expect(initializeConfig({ env: {}, loadEnvironment })).toBe(config);
        expect(loadEnvironment).toHaveBeenCalledTimes(1);
        expect(Object.isFrozen(config)).toBe(true);
        expect(Object.isFrozen(config.database)).toBe(true);
    });

    it('requires database credentials without echoing them', async () => {
        const { initializeConfig } = await import('../src/config/config.js');
        expect(() =>
            initializeConfig({
                env: { ...environment(), PG_USERNAME: '' },
                loadEnvironment: vi.fn(),
            })
        ).toThrow(/^Missing PG_USERNAME$/);
    });

    it('does not retain a failed initialization', async () => {
        const { initializeConfig } = await import('../src/config/config.js');
        expect(() => initializeConfig({ env: {}, loadEnvironment: vi.fn() })).toThrow();
        expect(
            initializeConfig({ env: environment(), loadEnvironment: vi.fn() }).database.name
        ).toBe('taskboard');
    });

    it('selects only the isolated database for opted-in integration tests', async () => {
        const { initializeConfig } = await import('../src/config/config.js');

        const config = initializeConfig({
            env: { ...environment(), RUN_DATABASE_TESTS: '1', NODE_ENV: 'test' },
            loadEnvironment: vi.fn(),
            testDatabase: true,
        });

        expect(config.database.name).toBe('taskboard_test');
    });

    it('blocks accidental assessment database configuration under test', async () => {
        const { initializeConfig } = await import('../src/config/config.js');
        expect(() =>
            initializeConfig({
                env: { ...environment(), NODE_ENV: 'test' },
                loadEnvironment: vi.fn(),
            })
        ).toThrow('Database tests require explicit opt-in');
    });

    it('cannot reuse assessment configuration for a test connection', async () => {
        const { initializeConfig } = await import('../src/config/config.js');
        initializeConfig({ env: environment(), loadEnvironment: vi.fn() });
        expect(() => initializeConfig({ testDatabase: true })).toThrow(
            'Configuration already initialized for a different database mode'
        );
    });
});

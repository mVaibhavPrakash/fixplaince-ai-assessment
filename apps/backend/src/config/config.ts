import { loadEnvFile } from 'node:process';
import { DEFAULT_HTTP_PORT, DEFAULT_POSTGRES_PORT, LOCAL_HOST, MAX_PORT } from './constants.js';
import type { AppConfig, ConfigOptions } from './types.js';

let config: Readonly<AppConfig> | undefined;
let initializedForTests = false;

function required(env: NodeJS.ProcessEnv, key: string): string {
    const value = env[key];
    if (value === undefined || value.trim() === '') {
        throw new Error(`Missing ${key}`);
    }
    return value;
}

function port(value: string | undefined, key: string, fallback: number): number {
    if (value === undefined) {
        return fallback;
    }
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > MAX_PORT) {
        throw new Error(`Invalid ${key}`);
    }
    return Number(value);
}

export function initializeConfig(options: ConfigOptions = {}): Readonly<AppConfig> {
    if (config) {
        if ((options.testDatabase ?? false) !== initializedForTests) {
            throw new Error('Configuration already initialized for a different database mode');
        }
        return config;
    }
    const { env = process.env, loadEnvironment = loadEnvFile, testDatabase = false } = options;
    try {
        loadEnvironment();
    } catch {
        throw new Error('Unable to load environment configuration');
    }
    const assessmentName = required(env, 'PG_DATABASE');
    const testName = required(env, 'PG_TEST_DATABASE');
    if (testName === assessmentName || !testName.endsWith('_test')) {
        throw new Error('Test database must be distinct and end in _test');
    }
    // Test isolation is independent of the assessment's mocked authentication.
    // This is not a production/development authentication branch.
    if (
        (testDatabase || env.NODE_ENV === 'test') &&
        (!testDatabase || env.RUN_DATABASE_TESTS !== '1')
    ) {
        throw new Error('Database tests require explicit opt-in');
    }

    const database = Object.freeze({
        host: required(env, 'PG_HOST'),
        port: port(env.PG_PORT, 'PG_PORT', DEFAULT_POSTGRES_PORT),
        username: required(env, 'PG_USERNAME'),
        password: required(env, 'PG_PASSWORD'),
        name: testDatabase ? testName : assessmentName,
    });

    config = Object.freeze({
        host: LOCAL_HOST,
        port: port(env.PORT, 'PORT', DEFAULT_HTTP_PORT),
        database,
        runtimeDatabase: Object.freeze({
            ...database,
            username: env.PG_RUNTIME_USERNAME ?? 'taskboard_runtime',
            password: env.PG_RUNTIME_PASSWORD ?? database.password,
        }),
    });
    initializedForTests = testDatabase;
    return config;
}

export function getConfig(): Readonly<AppConfig> {
    if (!config) {
        throw new Error('Configuration has not been initialized');
    }
    return config;
}

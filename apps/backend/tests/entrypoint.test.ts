import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { startApplication } = vi.hoisted(() => ({ startApplication: vi.fn() }));
vi.mock('../src/application.js', () => ({ startApplication }));
const previousExitCode = process.exitCode;
beforeEach(() => {
    vi.resetModules();
    startApplication.mockReset();
    vi.spyOn(process, 'once').mockReturnValue(process);
});
afterEach(() => {
    process.exitCode = previousExitCode;
    vi.restoreAllMocks();
});

it('starts the complete backend through its executable entrypoint', async () => {
    startApplication.mockResolvedValue({ url: 'http://127.0.0.1:4000/graphql', stop: vi.fn() });
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await import('../src/index.js');
    expect(startApplication).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith('GraphQL API ready at http://127.0.0.1:4000/graphql');
});

it('reports a sanitized failure and marks startup unsuccessful', async () => {
    startApplication.mockRejectedValue(Error('SQL password=secret'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await import('../src/index.js');
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(
        'Backend initialization failed. Check local configuration and database availability.'
    );
});

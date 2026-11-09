export interface DatabaseConfig {
    readonly host: string;
    readonly port: number;
    readonly username: string;
    readonly password: string;
    readonly name: string;
}

export interface AppConfig {
    readonly host: string;
    readonly port: number;
    readonly database: Readonly<DatabaseConfig>;
    readonly runtimeDatabase: Readonly<DatabaseConfig>;
}

export interface ConfigOptions {
    env?: NodeJS.ProcessEnv;
    loadEnvironment?: () => void;
    testDatabase?: boolean;
}

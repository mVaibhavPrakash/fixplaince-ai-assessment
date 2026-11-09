import { Sequelize } from 'sequelize';
import type { DatabaseConfig } from '../config/types.js';

export function createDatabase(config: DatabaseConfig): Sequelize {
    return new Sequelize(config.name, config.username, config.password, {
        dialect: 'postgres',
        host: config.host,
        port: config.port,
        logging: false,
        define: { timestamps: false, underscored: true },
    });
}

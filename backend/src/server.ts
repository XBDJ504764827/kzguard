import { buildApp } from './app.js';
import { env } from './config/env.js';
import { initDatabase } from './db/mysql.js';

const start = async () => {
  const app = await buildApp();

  try {
    await initDatabase();
    app.log.info(`mysql connected to ${env.mysql.host}:${env.mysql.port}/${env.mysql.database}`);
    await app.listen({ port: env.port, host: env.host });
    app.log.info(`kzguard backend listening on http://${env.host}:${env.port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();

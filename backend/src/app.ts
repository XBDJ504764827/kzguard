import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { registerCommunityRoutes } from './modules/communities/routes.js';
import { registerHealthRoutes } from './modules/health/routes.js';
import { registerUserRoutes } from './modules/users/routes.js';
import { registerWhitelistRoutes } from './modules/whitelist/routes.js';
import { HttpError } from './utils/errors.js';

export const buildApp = async () => {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: env.corsOrigin,
    credentials: true
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      reply.code(error.statusCode).send({ message: error.message });
      return;
    }

    reply.code(500).send({ message: '服务异常，请稍后重试' });
  });

  await app.register(async (api) => {
    await registerHealthRoutes(api);
    await registerCommunityRoutes(api);
    await registerWhitelistRoutes(api);
    await registerUserRoutes(api);
  }, { prefix: '/api' });

  return app;
};

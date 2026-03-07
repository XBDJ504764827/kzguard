import type { FastifyInstance } from 'fastify';
import { listOperationLogs } from './service.js';

export const registerOperationLogRoutes = async (app: FastifyInstance) => {
  app.get('/operation-logs', async () => ({ data: await listOperationLogs() }));
};

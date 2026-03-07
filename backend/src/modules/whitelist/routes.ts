import type { FastifyInstance } from 'fastify';
import { HttpError } from '../../utils/errors.js';
import { createApplication, createManualWhitelistEntry, listWhitelist, reviewPlayer } from './service.js';

const getOperatorId = (headers: Record<string, unknown>) => {
  const value = headers['x-kzguard-operator-id'];
  return typeof value === 'string' ? value : undefined;
};

export const registerWhitelistRoutes = async (app: FastifyInstance) => {
  app.get('/whitelist', async (request) => {
    const query = request.query as { status?: 'approved' | 'pending' | 'rejected' };
    return { data: await listWhitelist(query.status) };
  });

  app.post('/whitelist/applications', async (request, reply) => {
    const player = await createApplication(request.body as Parameters<typeof createApplication>[0]);
    reply.code(201);
    return { data: player, message: '白名单申请已提交' };
  });

  app.post('/whitelist/manual', async (request, reply) => {
    const player = await createManualWhitelistEntry(
      request.body as Parameters<typeof createManualWhitelistEntry>[0],
      getOperatorId(request.headers as Record<string, unknown>),
    );
    reply.code(201);
    return { data: player, message: '玩家已手动录入' };
  });

  app.patch('/whitelist/:playerId/status', async (request) => {
    const params = request.params as { playerId: string };
    const body = request.body as { status?: 'approved' | 'rejected'; note?: string };

    if (body.status !== 'approved' && body.status !== 'rejected') {
      throw new HttpError(400, '审核状态仅支持 approved 或 rejected');
    }

    await reviewPlayer(
      params.playerId,
      body.status,
      body.note,
      getOperatorId(request.headers as Record<string, unknown>),
    );
    return { message: '白名单状态已更新' };
  });
};

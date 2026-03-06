import type { FastifyInstance } from 'fastify';
import { createApplication, createManualWhitelistEntry, listWhitelist, reviewPlayer } from './service.js';
import type { WhitelistStatus } from '../../types/index.js';
import { HttpError } from '../../utils/errors.js';

export const registerWhitelistRoutes = async (app: FastifyInstance) => {
  app.get('/whitelist', async (request) => {
    const query = request.query as { status?: WhitelistStatus };
    return { data: listWhitelist(query.status) };
  });

  app.post('/whitelist/applications', async (request, reply) => {
    const player = createApplication(request.body as Parameters<typeof createApplication>[0]);
    reply.code(201);
    return { data: player, message: '白名单申请已提交' };
  });

  app.post('/whitelist/manual', async (request, reply) => {
    const player = createManualWhitelistEntry(request.body as Parameters<typeof createManualWhitelistEntry>[0]);
    reply.code(201);
    return { data: player, message: '玩家已手动录入' };
  });

  app.patch('/whitelist/:playerId/status', async (request) => {
    const params = request.params as { playerId: string };
    const body = request.body as { status?: 'approved' | 'rejected'; note?: string };

    if (body.status !== 'approved' && body.status !== 'rejected') {
      throw new HttpError(400, '审核状态仅支持 approved 或 rejected');
    }

    reviewPlayer(params.playerId, body.status, body.note);
    return { message: '白名单状态已更新' };
  });
};

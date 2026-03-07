import type { FastifyInstance } from 'fastify';
import { createManualBanEntry, deleteBanRecord, listBans, revokeBanRecord, updateBanRecord } from './service.js';

const getOperatorId = (headers: Record<string, unknown>) => {
  const value = headers['x-kzguard-operator-id'];
  return typeof value === 'string' ? value : undefined;
};

export const registerBanRoutes = async (app: FastifyInstance) => {
  app.get('/bans', async () => ({ data: await listBans() }));

  app.post('/bans/manual', async (request, reply) => {
    const ban = await createManualBanEntry(
      request.body as Parameters<typeof createManualBanEntry>[0],
      getOperatorId(request.headers as Record<string, unknown>),
    );
    reply.code(201);
    return { data: ban, message: '封禁记录已创建' };
  });

  app.patch('/bans/:banId', async (request) => {
    const params = request.params as { banId: string };
    const ban = await updateBanRecord(
      params.banId,
      request.body as Parameters<typeof updateBanRecord>[1],
      getOperatorId(request.headers as Record<string, unknown>),
    );

    return { data: ban, message: '封禁记录已更新' };
  });

  app.post('/bans/:banId/revoke', async (request) => {
    const params = request.params as { banId: string };
    const ban = await revokeBanRecord(params.banId, getOperatorId(request.headers as Record<string, unknown>));
    return { data: ban, message: '封禁已解除' };
  });

  app.delete('/bans/:banId', async (request) => {
    const params = request.params as { banId: string };
    await deleteBanRecord(params.banId, getOperatorId(request.headers as Record<string, unknown>));
    return { message: '封禁记录已删除' };
  });
};

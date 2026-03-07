import type { FastifyInstance } from 'fastify';
import { banServerPlayer } from '../bans/service.js';
import { createCommunity, createServer, kickServerPlayer, listCommunities, updateServerSettings } from './service.js';

const getOperatorId = (headers: Record<string, unknown>) => {
  const value = headers['x-kzguard-operator-id'];
  return typeof value === 'string' ? value : undefined;
};

export const registerCommunityRoutes = async (app: FastifyInstance) => {
  app.get('/communities', async () => ({ data: await listCommunities() }));

  app.post('/communities', async (request, reply) => {
    const body = request.body as { name?: string };
    const community = await createCommunity(body.name ?? '', getOperatorId(request.headers as Record<string, unknown>));
    reply.code(201);
    return { data: community, message: '社区创建成功' };
  });

  app.post('/communities/:communityId/servers', async (request, reply) => {
    const params = request.params as { communityId: string };
    const server = await createServer(
      params.communityId,
      request.body as Parameters<typeof createServer>[1],
      getOperatorId(request.headers as Record<string, unknown>),
    );
    reply.code(201);
    return { data: server, message: '服务器添加成功' };
  });

  app.patch('/communities/:communityId/servers/:serverId', async (request) => {
    const params = request.params as { communityId: string; serverId: string };
    const server = await updateServerSettings(
      params.communityId,
      params.serverId,
      request.body as Parameters<typeof updateServerSettings>[2],
      getOperatorId(request.headers as Record<string, unknown>),
    );

    return { data: server, message: '服务器设置已更新' };
  });

  app.post('/communities/:communityId/servers/:serverId/players/:playerId/kick', async (request) => {
    const params = request.params as { communityId: string; serverId: string; playerId: string };
    const body = request.body as { reason?: string };

    await kickServerPlayer(
      params.communityId,
      params.serverId,
      params.playerId,
      body.reason ?? '',
      getOperatorId(request.headers as Record<string, unknown>),
    );

    return { message: '玩家已踢出' };
  });

  app.post('/communities/:communityId/servers/:serverId/players/:playerId/ban', async (request, reply) => {
    const params = request.params as { communityId: string; serverId: string; playerId: string };
    const ban = await banServerPlayer(
      params.communityId,
      params.serverId,
      params.playerId,
      request.body as Parameters<typeof banServerPlayer>[3],
      getOperatorId(request.headers as Record<string, unknown>),
    );

    reply.code(201);
    return { data: ban, message: '玩家已封禁' };
  });
};

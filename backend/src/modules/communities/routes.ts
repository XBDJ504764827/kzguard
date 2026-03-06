import type { FastifyInstance } from 'fastify';
import { createCommunity, createServer, listCommunities } from './service.js';

export const registerCommunityRoutes = async (app: FastifyInstance) => {
  app.get('/communities', async () => ({ data: listCommunities() }));

  app.post('/communities', async (request, reply) => {
    const body = request.body as { name?: string };
    const community = createCommunity(body.name ?? '');
    reply.code(201);
    return { data: community, message: '社区创建成功' };
  });

  app.post('/communities/:communityId/servers', async (request, reply) => {
    const params = request.params as { communityId: string };
    const server = await createServer(params.communityId, request.body as Parameters<typeof createServer>[1]);
    reply.code(201);
    return { data: server, message: '服务器添加成功' };
  });
};

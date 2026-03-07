import type { FastifyInstance } from 'fastify';
import { listWebsiteAdmins, updateWebsiteAdmin } from './service.js';

const getOperatorId = (headers: Record<string, unknown>) => {
  const value = headers['x-kzguard-operator-id'];
  return typeof value === 'string' ? value : undefined;
};

export const registerAdminRoutes = async (app: FastifyInstance) => {
  app.get('/admins', async () => ({ data: await listWebsiteAdmins() }));

  app.patch('/admins/:adminId', async (request) => {
    const params = request.params as { adminId: string };
    const admin = await updateWebsiteAdmin(
      params.adminId,
      request.body as Parameters<typeof updateWebsiteAdmin>[1],
      getOperatorId(request.headers as Record<string, unknown>),
    );

    return { data: admin, message: '管理员信息已更新' };
  });
};

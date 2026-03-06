import type { FastifyInstance } from 'fastify';

export const registerUserRoutes = async (app: FastifyInstance) => {
  app.get('/users/summary', async () => ({
    enabled: false,
    message: '网站用户模块待开发',
    plannedModules: [
      '网站管理员账号体系',
      '社区负责人角色权限',
      '玩家个人中心与白名单申请入口',
      '登录、鉴权与操作日志'
    ]
  }));
};

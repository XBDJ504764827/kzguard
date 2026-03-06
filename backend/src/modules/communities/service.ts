import { randomUUID } from 'node:crypto';
import { appStore } from '../../store/appStore.js';
import { HttpError } from '../../utils/errors.js';
import { verifyRconConnection } from '../../utils/rcon.js';
import { requireNonEmpty, validateServerDraft } from '../../utils/validation.js';
import type { CommunityRecord, ServerDraft, ServerRecord } from '../../types/index.js';

export const listCommunities = () => appStore.getState().communities;

export const createCommunity = (name: string): CommunityRecord => {
  requireNonEmpty(name, '请输入社区名称');

  const community: CommunityRecord = {
    id: `community_${randomUUID()}`,
    name: name.trim(),
    createdAt: new Date().toISOString(),
    servers: []
  };

  appStore.update((currentState) => ({
    ...currentState,
    communities: [community, ...currentState.communities]
  }));

  return community;
};

export const createServer = async (communityId: string, draft: ServerDraft): Promise<ServerRecord> => {
  validateServerDraft(draft);

  const currentState = appStore.getState();
  const community = currentState.communities.find((item) => item.id === communityId);

  if (!community) {
    throw new HttpError(404, '未找到目标社区');
  }

  const verified = await verifyRconConnection(draft);

  if (!verified) {
    throw new HttpError(400, 'RCON 校验失败，请检查服务器信息');
  }

  const server: ServerRecord = {
    id: `server_${randomUUID()}`,
    name: draft.name.trim(),
    ip: draft.ip.trim(),
    port: draft.port,
    rconPassword: draft.rconPassword,
    rconVerifiedAt: new Date().toISOString()
  };

  appStore.update((state) => ({
    ...state,
    communities: state.communities.map((item) => {
      if (item.id !== communityId) {
        return item;
      }

      return {
        ...item,
        servers: [server, ...item.servers]
      };
    })
  }));

  return server;
};

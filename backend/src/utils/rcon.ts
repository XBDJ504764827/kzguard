import type { ServerDraft } from '../types/index.js';

export const verifyRconConnection = async (draft: ServerDraft) => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return draft.rconPassword.trim().length >= 6 && draft.port > 0;
};

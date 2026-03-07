export const STEAM_PENDING_TEXT = '待后端识别';

const STEAM_ID64_BASE = 76561197960265728n;

const fromAccountId = (accountId: bigint) => {
  const y = accountId % 2n;
  const z = (accountId - y) / 2n;

  return {
    steamId64: (STEAM_ID64_BASE + accountId).toString(),
    steamId: `STEAM_1:${y.toString()}:${z.toString()}`,
    steamId3: `[U:1:${accountId.toString()}]`,
  };
};

export const resolveSteamIdentifiers = (input: string) => {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return {
      steamId64: STEAM_PENDING_TEXT,
      steamId: STEAM_PENDING_TEXT,
      steamId3: STEAM_PENDING_TEXT,
      resolved: false,
    };
  }

  const profileUrlMatch = trimmedInput.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (profileUrlMatch) {
    const accountId = BigInt(profileUrlMatch[1]) - STEAM_ID64_BASE;
    return {
      ...fromAccountId(accountId),
      resolved: true,
    };
  }

  if (/^\d{17}$/.test(trimmedInput)) {
    const accountId = BigInt(trimmedInput) - STEAM_ID64_BASE;
    return {
      ...fromAccountId(accountId),
      resolved: true,
    };
  }

  const steamIdMatch = trimmedInput.match(/^STEAM_[0-5]:([0-1]):(\d+)$/i);
  if (steamIdMatch) {
    const y = BigInt(steamIdMatch[1]);
    const z = BigInt(steamIdMatch[2]);
    const accountId = z * 2n + y;
    return {
      ...fromAccountId(accountId),
      resolved: true,
    };
  }

  const steamId3Match = trimmedInput.match(/^\[?U:1:(\d+)\]?$/i);
  if (steamId3Match) {
    return {
      ...fromAccountId(BigInt(steamId3Match[1])),
      resolved: true,
    };
  }

  return {
    steamId64: STEAM_PENDING_TEXT,
    steamId: STEAM_PENDING_TEXT,
    steamId3: STEAM_PENDING_TEXT,
    resolved: false,
  };
};

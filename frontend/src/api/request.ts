import { apiConfig } from './config';

const CURRENT_ADMIN_STORAGE_KEY = 'kzguard-current-admin-id';

const createHeaders = (init?: RequestInit) => {
  const headers = new Headers(init?.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (typeof window !== 'undefined') {
    const currentAdminId = window.localStorage.getItem(CURRENT_ADMIN_STORAGE_KEY);

    if (currentAdminId && !headers.has('x-kzguard-operator-id')) {
      headers.set('x-kzguard-operator-id', currentAdminId);
    }
  }

  return headers;
};

const hasMessage = (value: unknown): value is { message?: string } => {
  return typeof value === 'object' && value !== null && 'message' in value;
};

export const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${apiConfig.baseUrl}${path}`, {
    ...init,
    headers: createHeaders(init),
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? ((await response.json()) as T | { message?: string }) : null;

  if (!response.ok) {
    const message = hasMessage(payload) && payload.message ? payload.message : `请求失败 (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
};

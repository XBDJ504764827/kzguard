const AUTH_TOKEN_STORAGE_KEY = 'kzguard-auth-token';

export const getStoredAuthToken = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? '';
};

export const persistAuthToken = (token: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
};

export const clearStoredAuthToken = () => {
  persistAuthToken('');
};

import type { ApiMode } from '../types';

const getDefaultApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:3000/api';
  }

  return `http://${window.location.hostname}:3000/api`;
};

export const apiConfig = {
  mode: 'http',
  baseUrl: (import.meta.env.VITE_API_BASE_URL || getDefaultApiBaseUrl()).replace(/\/$/, ''),
} satisfies {
  mode: ApiMode;
  baseUrl: string;
};

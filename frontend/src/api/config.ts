import type { ApiMode } from '../types';

const envMode = import.meta.env.VITE_API_MODE;

export const apiConfig = {
  mode: envMode === 'http' ? 'http' : 'mock',
  baseUrl: (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000/api').replace(/\/$/, ''),
} satisfies {
  mode: ApiMode;
  baseUrl: string;
};

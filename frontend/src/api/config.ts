import type { ApiMode } from '../types';

export const apiConfig = {
  mode: 'http',
  baseUrl: (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000/api').replace(/\/$/, ''),
} satisfies {
  mode: ApiMode;
  baseUrl: string;
};

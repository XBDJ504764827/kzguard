import { apiConfig } from './config';
import { httpApi } from './adapters/httpAdapter';
import { mockApi } from './adapters/mockAdapter';

export const apiService = apiConfig.mode === 'http' ? httpApi : mockApi;

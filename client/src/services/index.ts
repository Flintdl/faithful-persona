import type { ApiClient } from '@shared/types/api.types';
import { HttpApiClient } from './HttpApiClient';
import { MockApiClient } from './MockApiClient';
import { log } from '@/utils/Logger';

const useMock = import.meta.env.VITE_USE_MOCK_BACKEND !== 'false';
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export const api: ApiClient = useMock ? new MockApiClient() : new HttpApiClient(baseUrl);

log.info(`api client mode: ${useMock ? 'MOCK (localStorage)' : `HTTP ${baseUrl}`}`);

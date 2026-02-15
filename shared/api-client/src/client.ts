/**
 * evscrap Typed API Client
 *
 * openapi-fetch 기반 타입 안전 클라이언트.
 * baseUrl을 런타임에서 주입하여 환경별로 사용.
 *
 * @example
 * import { createApiClient } from '@evscrap/api-client';
 * const api = createApiClient('https://api.example.com/prod');
 * const { data } = await api.GET('/health');
 */
import createClient, { type ClientOptions } from 'openapi-fetch';
import type { paths } from './generated/openapi-types';

export interface ApiClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
}

/**
 * 타입 안전 API 클라이언트 생성
 * @param options.baseUrl - API Gateway URL (e.g. "https://xxx.execute-api.ap-northeast-2.amazonaws.com/prod")
 * @param options.headers - 기본 헤더 (Authorization 등)
 */
export function createApiClient(options: ApiClientOptions) {
  const clientOptions: ClientOptions = {
    baseUrl: options.baseUrl,
    headers: options.headers,
  };
  return createClient<paths>(clientOptions);
}

export type ApiClient = ReturnType<typeof createApiClient>;

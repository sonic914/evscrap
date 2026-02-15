/**
 * Admin API 클라이언트
 * @evscrap/api-client를 래핑하여 baseUrl + 토큰 자동 주입
 */
import { createApiClient } from '@evscrap/api-client';
import { getToken } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

if (!API_BASE) {
  console.warn('[api] NEXT_PUBLIC_API_BASE 환경변수 설정 필요');
}

export function getAdminApi() {
  const token = getToken();
  return createApiClient({
    baseUrl: API_BASE,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

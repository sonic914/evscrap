/**
 * Admin API 클라이언트
 *
 * 보수적 원칙:
 * - 모든 요청에 x-correlation-id 헤더 주입 (crypto.randomUUID())
 * - Authorization: Bearer <admin_id_token>
 * - 쓰기 요청에는 Idempotency-Key 별도 주입
 */
import { createApiClient, type ApiClient } from '@evscrap/api-client';
import { getAdminToken } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

if (typeof window !== 'undefined' && !API_BASE) {
  console.warn('[api] NEXT_PUBLIC_API_BASE 환경변수 설정 필요');
}

/**
 * 요청별 correlation_id가 포함된 API 클라이언트 생성
 * 페이지/액션 단위로 호출하여 사용
 */
export function getAdminApi(): ApiClient {
  const token = getAdminToken();
  const correlationId = crypto.randomUUID();

  const headers: Record<string, string> = {
    'x-correlation-id': correlationId,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return createApiClient({ baseUrl: API_BASE, headers });
}

/**
 * 쓰기 요청용 Idempotency-Key 생성
 */
export function makeIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * openapi-fetch 0.13.x의 PathsWithMethod 타입이 paths 수 26개 이상에서
 * depth limit에 걸리는 이슈 우회용 untyped GET 래퍼.
 * 런타임 동작은 정상이며 응답은 as unknown으로 캐스팅.
 *
 * TODO: openapi-fetch를 0.14+ 또는 1.x로 업그레이드 시 제거
 */
export async function adminGet<T = unknown>(
  path: string,
  options?: { params?: { path?: Record<string, string>; query?: Record<string, unknown> } },
): Promise<{ data: T | undefined; error: unknown; response: Response | undefined }> {
  const api = getAdminApi() as any;
  return api.GET(path, options);
}

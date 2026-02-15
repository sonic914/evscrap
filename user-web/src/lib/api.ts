/**
 * User API 클라이언트
 *
 * 보수적 원칙:
 * - 모든 요청에 x-correlation-id 헤더 주입
 * - Authorization: Bearer <user_id_token>
 * - 401 → 토큰 삭제 + /login 리다이렉트
 */
import { createApiClient } from '@evscrap/api-client';
import { getToken, logout } from './auth';

const API_BASE = import.meta.env.VITE_API_BASE || '';

if (typeof window !== 'undefined' && !API_BASE) {
  console.warn('[api] VITE_API_BASE 환경변수 설정 필요');
}

/**
 * 요청별 correlation_id가 포함된 User API 클라이언트
 */
export function getUserApi() {
  const token = getToken();
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
 * 401 응답 시 토큰 삭제 + /login 리다이렉트
 * @returns true면 리다이렉트 발생 (이후 로직 중단)
 */
export function handle401(status: number | undefined, navigate: (path: string) => void): boolean {
  if (status === 401) {
    logout();
    navigate('/login');
    return true;
  }
  return false;
}

/**
 * 쓰기 요청용 Idempotency-Key 생성
 */
export function makeIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * 클라이언트 사이드 인증 가드 훅
 *
 * Next.js middleware는 localStorage 접근 불가하므로
 * 클라이언트 사이드에서 토큰 확인 후 리다이렉트
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminToken, signOutAdmin } from './auth';

/**
 * 보호 라우트에서 사용.
 * 토큰이 없으면 /login으로 리다이렉트.
 * @returns authenticated 여부
 */
export function useAuthGuard(): boolean {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      router.replace('/login');
    } else {
      setAuthenticated(true);
    }
  }, [router]);

  return authenticated;
}

/**
 * API 응답에서 401이면 토큰 삭제 + /login 리다이렉트
 * @returns true면 401이었음 (호출자가 추가 처리하지 않아도 됨)
 */
export function handle401(
  status: number | undefined,
  router: ReturnType<typeof useRouter>
): boolean {
  if (status === 401) {
    signOutAdmin();
    router.replace('/login');
    return true;
  }
  return false;
}

/**
 * Cognito 인증 유틸 (Admin Pool)
 * amazon-cognito-identity-js 사용 — 브라우저 친화적이고 SDK v3보다 경량
 *
 * 보수적 원칙:
 * - 토큰은 localStorage에 저장 (MVP, 추후 httpOnly cookie로 강화 가능)
 * - 키 이름 고정: "admin_id_token"
 * - 토큰/비밀번호 등 민감정보 로그 출력 금지 (길이만 가능)
 */
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js';

const TOKEN_KEY = 'admin_id_token';

function getUserPool(): CognitoUserPool {
  const poolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID_ADMIN || '';
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID_ADMIN || '';

  if (!poolId || !clientId) {
    throw new Error(
      'Cognito 설정 필요: NEXT_PUBLIC_COGNITO_USER_POOL_ID_ADMIN, NEXT_PUBLIC_COGNITO_CLIENT_ID_ADMIN'
    );
  }

  return new CognitoUserPool({ UserPoolId: poolId, ClientId: clientId });
}

/**
 * 관리자 로그인 → idToken 반환 (localStorage에 저장)
 */
export async function signInAdmin(
  username: string,
  password: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const pool = getUserPool();
    const user = new CognitoUser({ Username: username, Pool: pool });
    const authDetails = new AuthenticationDetails({
      Username: username,
      Password: password,
    });

    user.authenticateUser(authDetails, {
      onSuccess: (result) => {
        const idToken = result.getIdToken().getJwtToken();
        console.log(`[auth] 로그인 성공 (token length: ${idToken.length})`);
        localStorage.setItem(TOKEN_KEY, idToken);
        resolve(idToken);
      },
      onFailure: (err) => {
        console.error('[auth] 로그인 실패:', err.message);
        reject(err);
      },
    });
  });
}

/**
 * 토큰 조회 (서버 사이드에서는 null)
 */
export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * 로그아웃 — 토큰 삭제
 */
export function signOutAdmin(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * 로그인 여부 확인
 */
export function isAdminLoggedIn(): boolean {
  return !!getAdminToken();
}

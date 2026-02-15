/**
 * Cognito 인증 유틸 (Admin Pool)
 * amazon-cognito-identity-js 사용 — 브라우저 친화적이고 SDK v3보다 경량
 */
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js';

function getUserPool(): CognitoUserPool {
  const poolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID_ADMIN || '';
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID_ADMIN || '';

  if (!poolId || !clientId) {
    throw new Error('Cognito 설정 필요: NEXT_PUBLIC_COGNITO_USER_POOL_ID_ADMIN, NEXT_PUBLIC_COGNITO_CLIENT_ID_ADMIN');
  }

  return new CognitoUserPool({
    UserPoolId: poolId,
    ClientId: clientId,
  });
}

export async function login(username: string, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const pool = getUserPool();
    const user = new CognitoUser({ Username: username, Pool: pool });
    const authDetails = new AuthenticationDetails({ Username: username, Password: password });

    user.authenticateUser(authDetails, {
      onSuccess: (result) => {
        const idToken = result.getIdToken().getJwtToken();
        console.log(`[auth] 로그인 성공 (token length: ${idToken.length})`);
        localStorage.setItem('idToken', idToken);
        resolve(idToken);
      },
      onFailure: (err) => {
        console.error('[auth] 로그인 실패:', err.message);
        reject(err);
      },
    });
  });
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('idToken');
}

export function logout(): void {
  localStorage.removeItem('idToken');
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

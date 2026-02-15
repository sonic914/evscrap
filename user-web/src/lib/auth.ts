/**
 * Cognito 인증 유틸 (User Pool)
 * amazon-cognito-identity-js 사용 — 브라우저 친화적이고 SDK v3보다 경량
 */
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

const POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID_USER || '';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID_USER || '';

if (!POOL_ID || !CLIENT_ID) {
  console.warn('[auth] Cognito 설정 필요: VITE_COGNITO_USER_POOL_ID_USER, VITE_COGNITO_CLIENT_ID_USER');
}

const userPool = new CognitoUserPool({
  UserPoolId: POOL_ID,
  ClientId: CLIENT_ID,
});

export async function login(username: string, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: username, Pool: userPool });
    const authDetails = new AuthenticationDetails({ Username: username, Password: password });

    user.authenticateUser(authDetails, {
      onSuccess: (result: CognitoUserSession) => {
        const idToken = result.getIdToken().getJwtToken();
        console.log(`[auth] 로그인 성공 (token length: ${idToken.length})`);
        localStorage.setItem('user_id_token', idToken);
        resolve(idToken);
      },
      onFailure: (err: Error) => {
        console.error('[auth] 로그인 실패:', err.message);
        reject(err);
      },
    });
  });
}

export function getToken(): string | null {
  return localStorage.getItem('user_id_token');
}

export function logout(): void {
  localStorage.removeItem('user_id_token');
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

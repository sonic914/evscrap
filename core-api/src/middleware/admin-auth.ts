import { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

// Cognito Admin JWT Verifier (lazy init)
let adminVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getAdminVerifier() {
  if (!adminVerifier && process.env.ADMIN_POOL_ID && process.env.ADMIN_POOL_CLIENT_ID) {
    adminVerifier = CognitoJwtVerifier.create({
      userPoolId: process.env.ADMIN_POOL_ID,
      tokenUse: 'id',
      clientId: process.env.ADMIN_POOL_CLIENT_ID,
    });
  }
  return adminVerifier;
}

export const requireAdminAuth = async (req: Request, res: Response, next: NextFunction) => {
  // ─── Test Backdoor (시크릿 기반) ───
  const adminSecret = req.headers['x-admin-secret'] as string;
  const ADMIN_SECRET = process.env.ADMIN_AUTH_SECRET || 'evscrap-admin-secret-2026';

  if (adminSecret === ADMIN_SECRET) {
    return next();
  }

  // ─── JWT 검증 ───
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);

  // Cognito Admin 검증기 사용 가능?
  const jwtVerifier = getAdminVerifier();
  if (jwtVerifier) {
    try {
      await jwtVerifier.verify(token);
      return next();
    } catch (err) {
      console.warn('[AdminAuth] JWT verification failed:', (err as Error).message);
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired admin token' });
    }
  }

  // ─── Fallback: Cognito 미설정 시 (로컬 개발) ───
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized', message: 'Admin authentication not configured' });
};

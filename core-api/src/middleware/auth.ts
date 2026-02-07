import { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        tenantId: string;
        sub: string;
      };
    }
  }
}

// Cognito JWT Verifier (lazy init)
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
  if (!verifier && process.env.USER_POOL_ID && process.env.USER_POOL_CLIENT_ID) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: process.env.USER_POOL_ID,
      tokenUse: 'id',
      clientId: process.env.USER_POOL_CLIENT_ID,
    });
  }
  return verifier;
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  // ─── Test Backdoor (시크릿 기반) ───
  const testSecret = req.headers['x-test-secret'] as string;
  const testTenantId = req.headers['x-test-tenant-id'] as string;
  const TEST_SECRET = process.env.TEST_AUTH_SECRET || 'evscrap-test-secret-2026';

  if (testSecret === TEST_SECRET && testTenantId) {
    req.user = {
      tenantId: testTenantId,
      sub: 'test-user-sub',
    };
    return next();
  }

  // ─── JWT 검증 ───
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);

  // Cognito 검증기 사용 가능?
  const jwtVerifier = getVerifier();
  if (jwtVerifier) {
    try {
      const payload = await jwtVerifier.verify(token);
      // Cognito JWT에서 sub과 custom:tenant_id 추출
      // tenant_id 매핑: custom attribute 또는 sub 자체를 사용
      const tenantId = (payload as any)['custom:tenant_id'] || payload.sub;
      req.user = {
        tenantId,
        sub: payload.sub,
      };
      return next();
    } catch (err) {
      console.warn('[Auth] JWT verification failed:', (err as Error).message);
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  }

  // ─── Fallback: Cognito 미설정 시 (로컬 개발) ───
  if (process.env.NODE_ENV !== 'production') {
    req.user = {
      tenantId: 'local-dev-tenant',
      sub: 'local-dev-sub',
    };
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized', message: 'Authentication not configured' });
};

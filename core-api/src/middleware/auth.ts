import { Request, Response, NextFunction } from 'express';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        tenantId: string;
        sub: string;
      }
    }
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  // TODO: Implement Real Cognito JWT verification
  
  // For MVP Dev: Check for Test Headers or Mock
  const testTenantId = req.headers['x-test-tenant-id'] as string;
  
  if (process.env.NODE_ENV === 'development' && testTenantId) {
      req.user = {
          tenantId: testTenantId,
          sub: 'test-user-sub'
      };
      return next();
  }

  // If no mock header, normally we would check Authorization Bearer
  // For now, let's just log and fail if we want to be strict, 
  // or allow permissive for initial scaffolding.
  // The spec says 401 is possible.
  
  const authHeader = req.headers.authorization;
  if (!authHeader) {
     return res.status(401).json({ error: 'Unauthorized', message: 'Missing Authorization header' });
  }

  // Valid Token Mock (Allow anything starting with "Bearer ")
  if (authHeader.startsWith('Bearer ')) {
      req.user = {
          tenantId: 'mock-tenant-id-from-token',
          sub: 'mock-sub'
      };
      return next();
  }

  return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
};

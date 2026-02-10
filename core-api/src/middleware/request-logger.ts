import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger, requestContext } from '../utils/logger';

/**
 * 요청 로깅 + correlation_id 미들웨어
 *
 * correlation_id 우선순위:
 *   1. 클라이언트 헤더: x-correlation-id
 *   2. API Gateway requestContext.requestId
 *   3. uuid 자동 생성
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    (req as any).apiGateway?.event?.requestContext?.requestId ||
    crypto.randomUUID();

  const tenantId = (req as any).user?.tenantId;
  const startTime = Date.now();

  // 응답 헤더에도 반영 (디버깅 편의)
  res.setHeader('x-correlation-id', correlationId);

  // AsyncLocalStorage에 컨텍스트 저장
  requestContext.run({ correlation_id: correlationId, tenant_id: tenantId }, () => {
    // 요청 시작 로그
    logger.info('REQUEST_START', {
      method: req.method,
      path: req.path,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      user_agent: req.headers['user-agent']?.substring(0, 100),
    });

    // 응답 종료 시 로그
    const originalEnd = res.end.bind(res);
    res.end = function (...args: any[]) {
      const latencyMs = Date.now() - startTime;

      logger.info('REQUEST_END', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        latency_ms: latencyMs,
      });

      // 5xx는 별도 에러 로그
      if (res.statusCode >= 500) {
        logger.error('SERVER_ERROR', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          latency_ms: latencyMs,
        });
      }

      return originalEnd(...args);
    } as any;

    next();
  });
};

import { Request, Response, NextFunction } from 'express';
import { errorResponse, ErrorCode } from '../utils/response';

/**
 * Idempotency-Key 헤더 필수 검증 미들웨어
 * ACK 등 중복 클릭이 빈번한 엔드포인트에 사용
 */
export const requireIdempotencyKey = (req: Request, res: Response, next: NextFunction) => {
  const key = req.headers['idempotency-key'] as string;
  if (!key || !key.trim()) {
    return errorResponse(res, 400, ErrorCode.MISSING_IDEMPOTENCY_KEY,
      'Idempotency-Key header is required for this endpoint');
  }
  next();
};

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../prisma';

/**
 * 멱등성 미들웨어
 * Idempotency-Key 헤더가 있을 때만 동작한다.
 * scope = 인증 주체 (tenantId / admin sub), endpoint = "METHOD path"
 */
export const idempotency = async (req: Request, res: Response, next: NextFunction) => {
  const key = req.headers['idempotency-key'] as string;
  if (!key) return next(); // 헤더 없으면 통과

  // ─── scope 결정 ───
  const tenantId = (req as any).user?.tenantId;
  const sub = (req as any).user?.sub;
  let scopeType: string;
  let scopeId: string;

  if (tenantId) {
    scopeType = 'TENANT';
    scopeId = tenantId;
  } else if (sub) {
    scopeType = 'USER';
    scopeId = sub;
  } else {
    // scope를 못 구하면 적용 제외 (보수적)
    return next();
  }

  const endpoint = `${req.method} ${req.baseUrl}${req.path}`;
  const bodyHash = crypto.createHash('sha256')
    .update(JSON.stringify(req.body || {}))
    .digest('hex');

  try {
    // ─── 기존 레코드 조회 ───
    const existing = await prisma.idempotencyRecord.findUnique({
      where: {
        scopeType_scopeId_endpoint_idempotencyKey: {
          scopeType, scopeId, endpoint, idempotencyKey: key,
        },
      },
    });

    if (existing) {
      // 1) request_hash 불일치 → 409 CONFLICT
      if (existing.requestHash && existing.requestHash !== bodyHash) {
        return res.status(409).json({
          error_code: 'IDEMPOTENCY_KEY_CONFLICT',
          message: 'Idempotency key reused with different payload',
        });
      }

      // 2) IN_PROGRESS → 409 처리중
      if (existing.status === 'IN_PROGRESS') {
        return res.status(409).json({
          error_code: 'IDEMPOTENCY_IN_PROGRESS',
          message: 'Previous request with this key is still processing',
        });
      }

      // 3) COMPLETED → 캐시 응답 재전송
      console.log(`[Idempotency] Replay: ${key}`);
      res.setHeader('Idempotency-Replayed', 'true');
      return res.status(existing.responseStatus || 200).json(existing.responseBody);
    }

    // ─── 새 레코드 생성 (IN_PROGRESS) ───
    let recordId: string;
    try {
      const record = await prisma.idempotencyRecord.create({
        data: {
          scopeType,
          scopeId,
          endpoint,
          idempotencyKey: key,
          requestHash: bodyHash,
          status: 'IN_PROGRESS',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h TTL
        },
      });
      recordId = record.id;
    } catch (e: any) {
      // unique 충돌 (race condition) → 재시도 안내
      if (e.code === 'P2002') {
        return res.status(409).json({
          error_code: 'IDEMPOTENCY_IN_PROGRESS',
          message: 'Concurrent request with this key detected',
        });
      }
      throw e;
    }

    // ─── 응답 캡처: res.json 래핑 ───
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      const statusCode = res.statusCode;

      if (statusCode >= 200 && statusCode < 300) {
        // 2xx 성공 → COMPLETED로 업데이트
        prisma.idempotencyRecord.update({
          where: { id: recordId },
          data: {
            status: 'COMPLETED',
            responseStatus: statusCode,
            responseBody: body,
          },
        }).catch(err => console.error('[Idempotency] Save failed:', err));
      } else {
        // 4xx/5xx → IN_PROGRESS 레코드 삭제 (재시도 허용)
        prisma.idempotencyRecord.delete({
          where: { id: recordId },
        }).catch(err => console.error('[Idempotency] Cleanup failed:', err));
      }

      return originalJson(body);
    };

    next();
  } catch (error) {
    console.error('[Idempotency] Error:', error);
    next(); // fail open
  }
};

/**
 * Admin Evidence 조회 API (P2-1.5)
 * GET /admin/v1/evidence?tenant_id=X
 *
 * ⚠️ Evidence 테이블에는 targetType/targetId가 없음 (tenant_id만 존재).
 * MVP에서는 tenant 기준 조회 + presigned GET URL 제공.
 * 향후 Evidence ↔ Case/Lot 연결 시 스키마 확장 필요.
 */
import { Request, Response } from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import prisma from '../prisma';
import { toSnakeCaseKeys, errorResponse, ErrorCode } from '../utils/response';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const BUCKET_NAME = process.env.EVIDENCE_BUCKET_NAME;
const PRESIGN_EXPIRY = 600; // 10분

export const listEvidence = async (req: Request, res: Response) => {
  try {
    const { tenant_id, limit: rawLimit, offset: rawOffset } = req.query;

    if (!tenant_id) {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'tenant_id query parameter is required');
    }

    const limit = Math.min(Number(rawLimit) || 50, 200);
    const offset = Number(rawOffset) || 0;

    const items = await prisma.evidence.findMany({
      where: { tenantId: String(tenant_id) },
      orderBy: { uploadedAt: 'desc' },
      take: limit,
      skip: offset,
    });

    // presigned GET URL 생성 (BUCKET_NAME이 설정된 경우만)
    const itemsWithUrl = await Promise.all(
      items.map(async (ev) => {
        const base = toSnakeCaseKeys(ev);
        if (BUCKET_NAME && ev.s3Key) {
          try {
            const command = new GetObjectCommand({
              Bucket: ev.s3Bucket || BUCKET_NAME,
              Key: ev.s3Key,
            });
            const url = await getSignedUrl(s3Client, command, { expiresIn: PRESIGN_EXPIRY });
            return { ...base, presigned_url: url, presign_expires_in: PRESIGN_EXPIRY };
          } catch {
            // presign 실패 시 URL 없이 반환
            return { ...base, presigned_url: null };
          }
        }
        return { ...base, presigned_url: null };
      })
    );

    return res.json({ items: itemsWithUrl, limit, offset });
  } catch (error) {
    console.error('Error listing evidence:', error);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to list evidence');
  }
};

import { Request, Response } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import prisma from '../prisma';
import { toSnakeCaseKeys, errorResponse, ErrorCode } from '../utils/response';

// Initialize S3 Client
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const BUCKET_NAME = process.env.EVIDENCE_BUCKET_NAME;

export const createPresignedUrl = async (req: Request, res: Response) => {
  try {
    const { filename, mime_type, target_type, target_id } = req.body;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return errorResponse(res, 401, ErrorCode.UNAUTHORIZED, 'User context missing');
    }

    if (!filename || !mime_type) {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'Missing filename or mime_type');
    }

    // target_type/target_id 유효성: 둘 다 있거나 둘 다 없어야
    if ((target_type && !target_id) || (!target_type && target_id)) {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'target_type and target_id must both be provided or both omitted');
    }

    if (target_type && !['CASE', 'LOT'].includes(target_type)) {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'target_type must be CASE or LOT');
    }

    // target 소유권 검증
    if (target_type === 'CASE' && target_id) {
      const kase = await prisma.case.findUnique({ where: { id: target_id } });
      if (!kase || kase.tenantId !== tenantId) {
        return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Case not found or access denied');
      }
    } else if (target_type === 'LOT' && target_id) {
      const lot = await prisma.lot.findUnique({ where: { id: target_id } });
      if (!lot || lot.tenantId !== tenantId) {
        return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Lot not found or access denied');
      }
    }

    if (!BUCKET_NAME) {
      throw new Error('Server configuration error: EVIDENCE_BUCKET_NAME not set');
    }

    const evidenceId = randomUUID();
    const s3Key = `tenants/${tenantId}/${evidenceId}/${filename}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ContentType: mime_type,
      Metadata: {
        tenantId: tenantId,
        evidenceId: evidenceId,
        ...(target_type && { targetType: target_type }),
        ...(target_id && { targetId: target_id }),
      },
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return res.json({
      presigned_url: presignedUrl,
      evidence_id: evidenceId,
      s3_key: s3Key,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  } catch (error: any) {
    console.error('Error creating presigned URL:', error);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to create presigned URL');
  }
};

export const registerEvidence = async (req: Request, res: Response) => {
  try {
    const { evidence_id, sha256, size_bytes, captured_at, s3_key, s3_bucket, target_type, target_id } = req.body;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return errorResponse(res, 401, ErrorCode.UNAUTHORIZED, 'User context missing');
    }

    if (!evidence_id || !sha256 || size_bytes == null) {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'Missing evidence_id, sha256, or size_bytes');
    }

    if (!s3_key) {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'Missing s3_key');
    }

    // target_type/target_id 유효성
    if ((target_type && !target_id) || (!target_type && target_id)) {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'target_type and target_id must both be provided or both omitted');
    }

    if (target_type && !['CASE', 'LOT'].includes(target_type)) {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'target_type must be CASE or LOT');
    }

    // target 소유권 검증
    if (target_type === 'CASE' && target_id) {
      const kase = await prisma.case.findUnique({ where: { id: target_id } });
      if (!kase || kase.tenantId !== tenantId) {
        return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Case not found or access denied');
      }
    } else if (target_type === 'LOT' && target_id) {
      const lot = await prisma.lot.findUnique({ where: { id: target_id } });
      if (!lot || lot.tenantId !== tenantId) {
        return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Lot not found or access denied');
      }
    }

    const bucket = s3_bucket || BUCKET_NAME;

    const evidence = await prisma.evidence.create({
      data: {
        id: evidence_id,
        tenantId,
        s3Bucket: bucket!,
        s3Key: s3_key,
        sha256,
        sizeBytes: size_bytes,
        mimeType: req.body.mime_type || 'application/octet-stream',
        capturedAt: captured_at ? new Date(captured_at) : undefined,
        targetType: target_type || null,
        targetId: target_id || null,
      },
    });

    return res.status(201).json(toSnakeCaseKeys(evidence));
  } catch (error: any) {
    console.error('Error registering evidence:', error);
    if (error.code === 'P2002') {
      return errorResponse(res, 409, ErrorCode.DUPLICATE_RESOURCE, 'Evidence ID already exists');
    }
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to register evidence');
  }
};

/**
 * GET /user/v1/:targetType/:targetId/evidence
 * target(CASE/LOT)에 연결된 evidence 목록 반환
 */
export const listEvidenceByTarget = async (req: Request, res: Response) => {
  try {
    const { targetType, targetId } = req.params;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return errorResponse(res, 401, ErrorCode.UNAUTHORIZED, 'User context missing');
    }

    if (!['CASE', 'LOT'].includes(targetType)) {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'target_type must be CASE or LOT');
    }

    // target 소유권 검증
    if (targetType === 'CASE') {
      const kase = await prisma.case.findUnique({ where: { id: targetId } });
      if (!kase || kase.tenantId !== tenantId) {
        return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Case not found or access denied');
      }
    } else {
      const lot = await prisma.lot.findUnique({ where: { id: targetId } });
      if (!lot || lot.tenantId !== tenantId) {
        return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Lot not found or access denied');
      }
    }

    const evidenceList = await prisma.evidence.findMany({
      where: {
        tenantId,
        targetType,
        targetId,
      },
      orderBy: { uploadedAt: 'desc' },
    });

    return res.json({
      items: evidenceList.map(toSnakeCaseKeys),
      total: evidenceList.length,
    });
  } catch (error: any) {
    console.error('Error listing evidence:', error);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to list evidence');
  }
};

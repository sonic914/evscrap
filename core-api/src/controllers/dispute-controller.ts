import { Request, Response } from 'express';
import prisma from '../prisma';
import { toSnakeCaseKeys, errorResponse, ErrorCode } from '../utils/response';

const VALID_REASON_CODES = ['AMOUNT_ERROR', 'MISSING_ITEM', 'GRADE_DISPUTE', 'OTHER'];
const ACTIVE_STATUSES = ['OPEN', 'UNDER_REVIEW', 'NEEDS_INFO'];

/**
 * POST /user/v1/settlements/:settlementId/disputes
 */
export const createDispute = async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userSub = req.user?.sub;
    if (!tenantId || !userSub) {
      return errorResponse(res, 401, ErrorCode.UNAUTHORIZED, 'User context missing');
    }

    const { settlementId } = req.params;
    const { reason_code, description, evidence_ids } = req.body;

    // validation
    if (!reason_code || !VALID_REASON_CODES.includes(reason_code)) {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR,
        `reason_code must be one of: ${VALID_REASON_CODES.join(', ')}`);
    }
    if (!description || typeof description !== 'string' || description.length < 1 || description.length > 2000) {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'description must be 1-2000 characters');
    }

    // A) settlement 조회
    const settlement = await prisma.settlement.findUnique({ where: { id: settlementId } });
    if (!settlement) {
      return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Settlement not found');
    }

    // B) tenant 격리: settlement의 target(CASE/LOT) 소유권 검증
    if (settlement.targetType === 'CASE') {
      const kase = await prisma.case.findUnique({ where: { id: settlement.targetId } });
      if (!kase || kase.tenantId !== tenantId) {
        return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Settlement not found or access denied');
      }
    } else if (settlement.targetType === 'LOT') {
      const lot = await prisma.lot.findUnique({ where: { id: settlement.targetId } });
      if (!lot || lot.tenantId !== tenantId) {
        return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Settlement not found or access denied');
      }
    }

    // C) COMMITTED만 허용
    if (settlement.status !== 'COMMITTED') {
      return errorResponse(res, 409, ErrorCode.INVALID_STATUS_TRANSITION,
        'Dispute can only be created for COMMITTED settlements');
    }

    // D) 활성 dispute 중복 방지
    const existing = await prisma.settlementDispute.findFirst({
      where: {
        settlementId,
        userSub,
        status: { in: ACTIVE_STATUSES },
      },
    });
    if (existing) {
      return errorResponse(res, 409, ErrorCode.DISPUTE_ALREADY_OPEN,
        'An active dispute already exists for this settlement');
    }

    // E) evidence_ids 검증
    const validEvidenceIds: string[] = [];
    if (evidence_ids && Array.isArray(evidence_ids) && evidence_ids.length > 0) {
      for (const eid of evidence_ids) {
        if (typeof eid !== 'string') {
          return errorResponse(res, 400, ErrorCode.INVALID_EVIDENCE_REFERENCE, `Invalid evidence_id: ${eid}`);
        }
        const ev = await prisma.evidence.findFirst({ where: { id: eid, tenantId } });
        if (!ev) {
          return errorResponse(res, 400, ErrorCode.INVALID_EVIDENCE_REFERENCE,
            `Evidence not found or access denied: ${eid}`);
        }
        validEvidenceIds.push(eid);
      }
    }

    // F) 생성
    const dispute = await prisma.settlementDispute.create({
      data: {
        settlementId,
        tenantId,
        userSub,
        reasonCode: reason_code,
        description,
        evidenceIds: validEvidenceIds.length > 0 ? validEvidenceIds : undefined,
        status: 'OPEN',
      },
    });

    return res.status(201).json(toSnakeCaseKeys(dispute));
  } catch (err: any) {
    console.error('[Dispute] createDispute error:', err?.message);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to create dispute');
  }
};

/**
 * GET /user/v1/disputes
 */
export const listDisputes = async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return errorResponse(res, 401, ErrorCode.UNAUTHORIZED, 'User context missing');
    }

    const { status, settlement_id } = req.query;
    const where: any = { tenantId };
    if (status && typeof status === 'string') where.status = status;
    if (settlement_id && typeof settlement_id === 'string') where.settlementId = settlement_id;

    const items = await prisma.settlementDispute.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ items: items.map(toSnakeCaseKeys), total: items.length });
  } catch (err: any) {
    console.error('[Dispute] listDisputes error:', err?.message);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to list disputes');
  }
};

/**
 * GET /user/v1/disputes/:disputeId
 */
export const getDispute = async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return errorResponse(res, 401, ErrorCode.UNAUTHORIZED, 'User context missing');
    }

    const dispute = await prisma.settlementDispute.findFirst({
      where: { id: req.params.disputeId, tenantId },
    });
    if (!dispute) {
      return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Dispute not found');
    }

    return res.json(toSnakeCaseKeys(dispute));
  } catch (err: any) {
    console.error('[Dispute] getDispute error:', err?.message);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to get dispute');
  }
};

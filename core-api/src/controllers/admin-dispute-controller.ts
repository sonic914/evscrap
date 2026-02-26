import { Request, Response } from 'express';
import prisma from '../prisma';
import { toSnakeCaseKeys, errorResponse, ErrorCode } from '../utils/response';

// 전이 규칙: current_status → allowed next statuses
const TRANSITION_MAP: Record<string, string[]> = {
  OPEN: ['UNDER_REVIEW', 'RESOLVED_REJECTED'],
  UNDER_REVIEW: ['RESOLVED_ACCEPTED', 'RESOLVED_REJECTED', 'NEEDS_INFO'],
  NEEDS_INFO: ['UNDER_REVIEW'],
};

/**
 * GET /admin/v1/disputes
 */
export const listDisputes = async (req: Request, res: Response) => {
  try {
    const { status, tenant_id, limit, offset } = req.query;
    const where: any = {};
    if (status && typeof status === 'string') where.status = status;
    if (tenant_id && typeof tenant_id === 'string') where.tenantId = tenant_id;

    const take = Math.min(Number(limit) || 50, 200);
    const skip = Number(offset) || 0;

    const [items, total] = await Promise.all([
      prisma.settlementDispute.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      prisma.settlementDispute.count({ where }),
    ]);

    return res.json({ items: items.map(toSnakeCaseKeys), total });
  } catch (err: any) {
    console.error('[AdminDispute] listDisputes error:', err?.message);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to list disputes');
  }
};

/**
 * GET /admin/v1/disputes/:disputeId
 */
export const getDispute = async (req: Request, res: Response) => {
  try {
    const dispute = await prisma.settlementDispute.findUnique({
      where: { id: req.params.disputeId },
    });
    if (!dispute) {
      return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Dispute not found');
    }
    return res.json(toSnakeCaseKeys(dispute));
  } catch (err: any) {
    console.error('[AdminDispute] getDispute error:', err?.message);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to get dispute');
  }
};

/**
 * POST /admin/v1/disputes/:disputeId/transition
 * Body: { next_status, admin_note?, current_status? }
 * Optimistic lock: UPDATE WHERE id=? AND status=current_status
 */
export const transitionDispute = async (req: Request, res: Response) => {
  try {
    const { disputeId } = req.params;
    const { next_status, admin_note, current_status } = req.body;

    if (!next_status || typeof next_status !== 'string') {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'next_status is required');
    }

    // 현재 dispute 조회
    const dispute = await prisma.settlementDispute.findUnique({ where: { id: disputeId } });
    if (!dispute) {
      return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Dispute not found');
    }

    // current_status가 제공되면 일치 확인 (optimistic lock)
    const expectedStatus = current_status || dispute.status;
    if (current_status && dispute.status !== current_status) {
      return errorResponse(res, 409, ErrorCode.DISPUTE_STATUS_CONFLICT,
        `Dispute status has changed. Expected ${current_status}, got ${dispute.status}`);
    }

    // 전이 규칙 검증
    const allowed = TRANSITION_MAP[expectedStatus];
    if (!allowed || !allowed.includes(next_status)) {
      return errorResponse(res, 409, ErrorCode.INVALID_STATUS_TRANSITION,
        `Cannot transition from ${expectedStatus} to ${next_status}. Allowed: ${(allowed || []).join(', ')}`);
    }

    // Optimistic lock: UPDATE WHERE status matches
    const result = await prisma.settlementDispute.updateMany({
      where: { id: disputeId, status: expectedStatus },
      data: {
        status: next_status,
        ...(admin_note !== undefined && { adminNote: admin_note }),
      },
    });

    if (result.count === 0) {
      return errorResponse(res, 409, ErrorCode.DISPUTE_STATUS_CONFLICT,
        'Dispute status was changed by another request');
    }

    const updated = await prisma.settlementDispute.findUnique({ where: { id: disputeId } });
    return res.json(toSnakeCaseKeys(updated));
  } catch (err: any) {
    console.error('[AdminDispute] transitionDispute error:', err?.message);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to transition dispute');
  }
};

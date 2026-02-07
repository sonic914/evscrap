import { Request, Response } from 'express';
import prisma from '../prisma';
import { toSnakeCaseKeys, errorResponse, ErrorCode } from '../utils/response';

export const createSettlement = async (req: Request, res: Response) => {
  try {
    const { targetType, targetId } = req.params;
    const { amount_total, amount_min, amount_bonus } = req.body;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return errorResponse(res, 401, ErrorCode.UNAUTHORIZED, 'User context missing');
    }

    const validTargetTypes = ['CASE', 'LOT'];
    if (!validTargetTypes.includes(targetType)) {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'Invalid target type. Must be CASE or LOT.');
    }

    if (amount_total == null || typeof amount_total !== 'number' || amount_total <= 0) {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'amount_total is required and must be a positive number.');
    }

    // Verify ownership
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

    // Check for duplicate settlement
    const existing = await prisma.settlement.findFirst({
      where: { targetType, targetId },
    });
    if (existing) {
      return errorResponse(res, 409, ErrorCode.DUPLICATE_RESOURCE,
        'Settlement already exists for this target.',
        { settlement_id: existing.id });
    }

    const settlement = await prisma.settlement.create({
      data: {
        targetType,
        targetId,
        status: 'DRAFT',
        amountTotal: amount_total,
        amountMin: amount_min ?? null,
        amountBonus: amount_bonus ?? null,
      },
    });

    return res.status(201).json(toSnakeCaseKeys(settlement));
  } catch (error: any) {
    console.error('Error creating settlement:', error);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to create settlement');
  }
};

export const getSettlement = async (req: Request, res: Response) => {
  try {
    const { targetType, targetId } = req.params;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return errorResponse(res, 401, ErrorCode.UNAUTHORIZED, 'User context missing');
    }

    // Verify ownership
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

    const settlement = await prisma.settlement.findFirst({
      where: { targetType, targetId },
    });

    if (!settlement) {
      return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Settlement not found');
    }

    return res.json(toSnakeCaseKeys(settlement));
  } catch (error: any) {
    console.error('Error getting settlement:', error);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to get settlement');
  }
};

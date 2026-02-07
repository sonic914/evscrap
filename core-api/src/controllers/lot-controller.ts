import { Request, Response } from 'express';
import prisma from '../prisma';
import { toSnakeCaseKeys, errorResponse, ErrorCode } from '../utils/response';

export const createLot = async (req: Request, res: Response) => {
  try {
    const { parent_case_id, part_type, quantity, weight_kg } = req.body;

    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return errorResponse(res, 401, ErrorCode.UNAUTHORIZED, 'User context missing');
    }

    if (!part_type) {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'Missing required field: part_type');
    }

    if (parent_case_id) {
      const parentCase = await prisma.case.findUnique({ where: { id: parent_case_id } });
      if (!parentCase) {
        return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, `Parent case not found: ${parent_case_id}`);
      }
      if (parentCase.tenantId !== tenantId) {
        return errorResponse(res, 403, ErrorCode.FORBIDDEN, 'Access denied to parent case');
      }
    }

    const newLot = await prisma.lot.create({
      data: {
        parentCaseId: parent_case_id || null,
        partType: part_type,
        quantity: quantity || 1,
        weightKg: weight_kg,
        tenantId,
      },
    });

    return res.status(201).json(toSnakeCaseKeys(newLot));
  } catch (error: any) {
    console.error('Error creating lot:', error);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to create lot');
  }
};

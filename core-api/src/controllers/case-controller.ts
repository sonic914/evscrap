import { Request, Response } from 'express';
import prisma from '../prisma';
import { toSnakeCaseKeys, errorResponse, ErrorCode } from '../utils/response';

export const createCase = async (req: Request, res: Response) => {
  try {
    const { vin, make, model, year } = req.body;

    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return errorResponse(res, 401, ErrorCode.UNAUTHORIZED, 'User context missing');
    }

    if (!vin) {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'Missing required field: vin');
    }

    const newCase = await prisma.case.create({
      data: { vin, make, model, year, tenantId },
    });

    return res.status(201).json(toSnakeCaseKeys(newCase));
  } catch (error: any) {
    console.error('Error creating case:', error);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to create case');
  }
};

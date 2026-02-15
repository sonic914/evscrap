/**
 * Admin Timeline 조회 API (P2-1.5)
 * GET /admin/v1/:targetType/:targetId/timeline
 * — 기존 Event 테이블의 (targetType, targetId) 인덱스를 활용
 */
import { Request, Response } from 'express';
import prisma from '../prisma';
import { toSnakeCaseKeys, errorResponse, ErrorCode } from '../utils/response';

const VALID_TARGET_TYPES = ['CASE', 'LOT'];

export const getTimeline = async (req: Request, res: Response) => {
  try {
    const { targetType, targetId } = req.params;
    const { limit: rawLimit, before } = req.query;

    // targetType 검증
    if (!VALID_TARGET_TYPES.includes(targetType)) {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR,
        `Invalid targetType: ${targetType}. Must be one of: ${VALID_TARGET_TYPES.join(', ')}`);
    }

    const limit = Math.min(Number(rawLimit) || 200, 500);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      targetType,
      targetId,
    };

    if (before) {
      where.occurredAt = { lt: new Date(String(before)) };
    }

    const events = await prisma.event.findMany({
      where,
      orderBy: { occurredAt: 'asc' },
      take: limit,
    });

    return res.json({
      events: events.map(toSnakeCaseKeys),
      target_type: targetType,
      target_id: targetId,
    });
  } catch (error) {
    console.error('Error getting timeline:', error);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to get timeline');
  }
};

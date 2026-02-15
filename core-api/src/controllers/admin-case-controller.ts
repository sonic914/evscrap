/**
 * Admin Cases 조회 API (P2-1.5)
 * GET /admin/v1/cases — 케이스 목록 (필터: tenantId, vin, from/to, limit/offset)
 * GET /admin/v1/cases/:caseId — 케이스 상세 (lots 포함)
 */
import { Request, Response } from 'express';
import prisma from '../prisma';
import { toSnakeCaseKeys, errorResponse, ErrorCode } from '../utils/response';

export const listCases = async (req: Request, res: Response) => {
  try {
    const { tenant_id, vin, from, to, limit: rawLimit, offset: rawOffset } = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (tenant_id) where.tenantId = String(tenant_id);
    if (vin) where.vin = { contains: String(vin), mode: 'insensitive' };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to) where.createdAt.lte = new Date(String(to));
    }

    const limit = Math.min(Number(rawLimit) || 50, 200);
    const offset = Number(rawOffset) || 0;

    const cases = await prisma.case.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return res.json({
      items: cases.map(toSnakeCaseKeys),
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing cases:', error);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to list cases');
  }
};

export const getCaseDetail = async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;

    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      include: { lots: true },
    });

    if (!caseData) {
      return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Case not found');
    }

    // 이벤트 수 + 최신 이벤트 요약
    const eventCount = await prisma.event.count({
      where: { targetType: 'CASE', targetId: caseId },
    });
    const latestEvent = await prisma.event.findFirst({
      where: { targetType: 'CASE', targetId: caseId },
      orderBy: { occurredAt: 'desc' },
    });

    return res.json({
      ...toSnakeCaseKeys(caseData),
      lots: caseData.lots.map(toSnakeCaseKeys),
      event_count: eventCount,
      latest_event: latestEvent ? toSnakeCaseKeys(latestEvent) : null,
    });
  } catch (error) {
    console.error('Error getting case detail:', error);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to get case');
  }
};

import { Request, Response } from 'express';
import prisma from '../prisma';
import { toSnakeCaseKeys, errorResponse, ErrorCode } from '../utils/response';
import { logger } from '../utils/logger';

/** Settlement에 ack 정보를 부착하는 헬퍼 */
function attachAckInfo(settlement: any, userSub?: string) {
  const snaked = toSnakeCaseKeys(settlement);
  const acks: any[] = settlement.acks || [];
  // userSub이 주어지면 본인 ack만 확인, 아니면 첫 ack
  const myAck = userSub
    ? acks.find((a: any) => a.userSub === userSub)
    : acks[0];
  snaked.acked = !!myAck;
  snaked.acked_at = myAck ? myAck.ackedAt?.toISOString?.() || myAck.ackedAt : null;
  // acks 관계 키 제거 (응답 오염 방지)
  delete snaked.acks;
  return snaked;
}

/** 기본 breakdown 항목 자동 생성 (정산 생성 시) */
function buildDefaultBreakdownItems(amountTotal: number, amountMin?: number | null, amountBonus?: number | null) {
  const items: Array<{ code: string; title: string; category: string; amount: number; note?: string }> = [];

  if (amountMin != null) {
    items.push({
      code: 'BASE_MIN',
      title: '최소 보장 금액',
      category: 'MIN',
      amount: Math.round(amountMin),
      note: '정산 생성 시 자동 생성',
    });
  }

  if (amountBonus != null) {
    items.push({
      code: 'GRADE_BONUS',
      title: '등급 보너스',
      category: 'BONUS',
      amount: Math.round(amountBonus),
      note: '정산 생성 시 자동 생성',
    });
  }

  // 최소 1개 항목 보장 — min/bonus가 모두 없으면 전체 금액을 OTHER로
  if (items.length === 0) {
    items.push({
      code: 'TOTAL',
      title: '정산 총액',
      category: 'OTHER',
      amount: Math.round(amountTotal),
      note: '정산 생성 시 자동 생성 (항목 미분류)',
    });
  }

  return items;
}

/** breakdown 응답 빌드 (확장 친화 정합성 3중 검증) */
export function buildBreakdownResponse(
  settlement: { id: string; targetType: string; targetId: string; status: string; amountMin: number | null; amountBonus: number | null; amountTotal: number },
  items: Array<{ id: string; code: string; title: string; category: string; amount: number; quantity: any; unit: string | null; unitPrice: number | null; evidenceRef: string | null; note: string | null; createdAt: Date }>,
) {
  const minSum = items.filter(i => i.category === 'MIN').reduce((s, i) => s + i.amount, 0);
  const bonusSum = items.filter(i => i.category === 'BONUS').reduce((s, i) => s + i.amount, 0);
  const deductionSum = items.filter(i => i.category === 'DEDUCTION').reduce((s, i) => s + i.amount, 0);
  const otherSum = items.filter(i => !['MIN', 'BONUS', 'DEDUCTION'].includes(i.category)).reduce((s, i) => s + i.amount, 0);
  const totalCalc = minSum + bonusSum + deductionSum + otherSum;

  // 확장 친화 3중 정합성 검증
  const nonMinSum = bonusSum + deductionSum + otherSum;
  const min_ok = Math.abs((settlement.amountMin ?? 0) - minSum) < 1;
  const bonus_ok = Math.abs((settlement.amountBonus ?? 0) - nonMinSum) < 1;
  const total_ok = Math.abs(settlement.amountTotal - totalCalc) < 1;
  const consistencyOk = min_ok && bonus_ok && total_ok;

  const RULE = 'amount_min=sum(MIN); amount_bonus=sum(NON_MIN); amount_total=sum(ALL)';

  if (!consistencyOk) {
    logger.warn('Settlement breakdown consistency mismatch', {
      settlement_id: settlement.id,
      min_ok, bonus_ok, total_ok,
      minSum, nonMinSum, totalCalc,
      amount_min: settlement.amountMin,
      amount_bonus: settlement.amountBonus,
      amount_total: settlement.amountTotal,
    });
  }

  return {
    settlement_id: settlement.id,
    target_type: settlement.targetType,
    target_id: settlement.targetId,
    status: settlement.status,
    amount_min: settlement.amountMin,
    amount_bonus: settlement.amountBonus,
    amount_total: settlement.amountTotal,
    items: items.map(i => ({
      id: i.id,
      code: i.code,
      title: i.title,
      category: i.category,
      amount: i.amount,
      quantity: i.quantity != null ? Number(i.quantity) : null,
      unit: i.unit,
      unit_price: i.unitPrice,
      evidence_ref: i.evidenceRef,
      note: i.note,
      created_at: i.createdAt.toISOString(),
    })),
    summary: {
      min: minSum,
      bonus: bonusSum,
      deduction: deductionSum,
      other: otherSum,
      total: totalCalc,
    },
    consistency: {
      rule: RULE,
      ok: consistencyOk,
      details: { min_ok, bonus_ok, total_ok },
    },
  };
}

/**
 * GET /user/v1/settlements
 * 내 tenant의 케이스/랏에 대한 정산 목록 반환
 */
export const listSettlements = async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return errorResponse(res, 401, ErrorCode.UNAUTHORIZED, 'User context missing');
    }

    // tenant 소유 CASE/LOT ID 수집
    const [cases, lots] = await Promise.all([
      prisma.case.findMany({ where: { tenantId }, select: { id: true } }),
      prisma.lot.findMany({ where: { tenantId }, select: { id: true } }),
    ]);
    const caseIds = cases.map(c => c.id);
    const lotIds = lots.map(l => l.id);

    const userSub = req.user?.sub;

    // target이 내 CASE 또는 LOT인 정산만 (ack 포함)
    const settlements = await prisma.settlement.findMany({
      where: {
        OR: [
          { targetType: 'CASE', targetId: { in: caseIds } },
          { targetType: 'LOT', targetId: { in: lotIds } },
        ],
      },
      include: { acks: true },
      orderBy: { updatedAt: 'desc' },
    });

    return res.json({
      items: settlements.map(s => attachAckInfo(s, userSub)),
      total: settlements.length,
    });
  } catch (error: any) {
    console.error('Error listing settlements:', error);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to list settlements');
  }
};

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

    // 트랜잭션: settlement 생성 + breakdown 항목(멱등)
    const settlement = await prisma.$transaction(async (tx) => {
      const s = await tx.settlement.create({
        data: {
          targetType,
          targetId,
          status: 'DRAFT',
          amountTotal: amount_total,
          amountMin: amount_min ?? null,
          amountBonus: amount_bonus ?? null,
        },
      });

      // breakdown 항목 생성 (skipDuplicates로 unique 위반 무시)
      const candidates = buildDefaultBreakdownItems(amount_total, amount_min, amount_bonus)
        .map(item => ({ ...item, settlementId: s.id }));

      await tx.settlementBreakdownItem.createMany({
        data: candidates,
        skipDuplicates: true,
      });

      return s;
    });

    return res.status(201).json(toSnakeCaseKeys(settlement));
  } catch (error: any) {
    // P2002 = unique constraint → 중복 breakdown 시도, 무시
    if (error?.code === 'P2002') {
      const { targetType: tt, targetId: ti } = req.params;
      logger.warn('Settlement breakdown duplicate ignored (P2002)', { targetType: tt, targetId: ti });
      const existing = await prisma.settlement.findFirst({ where: { targetType: tt, targetId: ti } });
      if (existing) return res.status(201).json(toSnakeCaseKeys(existing));
    }
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

    const userSub = req.user?.sub;
    const settlement = await prisma.settlement.findFirst({
      where: { targetType, targetId },
      include: { acks: true },
    });

    if (!settlement) {
      return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Settlement not found');
    }

    return res.json(attachAckInfo(settlement, userSub));
  } catch (error: any) {
    console.error('Error getting settlement:', error);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to get settlement');
  }
};

/**
 * POST /user/v1/settlements/:settlementId/ack
 * 사용자 정산 확인(ACK)
 */
export const ackSettlement = async (req: Request, res: Response) => {
  try {
    const { settlementId } = req.params;
    const tenantId = req.user?.tenantId;
    const userSub = req.user?.sub;

    if (!tenantId || !userSub) {
      return errorResponse(res, 401, ErrorCode.UNAUTHORIZED, 'User context missing');
    }

    // A) Settlement 조회
    const settlement = await prisma.settlement.findUnique({ where: { id: settlementId } });
    if (!settlement) {
      return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Settlement not found');
    }

    // B) Tenant 격리: target의 tenantId 확인
    let targetTenantId: string | null = null;
    if (settlement.targetType === 'CASE') {
      const kase = await prisma.case.findUnique({ where: { id: settlement.targetId }, select: { tenantId: true } });
      targetTenantId = kase?.tenantId ?? null;
    } else if (settlement.targetType === 'LOT') {
      const lot = await prisma.lot.findUnique({ where: { id: settlement.targetId }, select: { tenantId: true } });
      targetTenantId = lot?.tenantId ?? null;
    }
    if (!targetTenantId || targetTenantId !== tenantId) {
      return errorResponse(res, 403, ErrorCode.FORBIDDEN, '이 정산에 대한 접근 권한이 없습니다');
    }

    // C) 상태 검증: COMMITTED만 ACK 가능
    if (settlement.status !== 'COMMITTED') {
      return errorResponse(res, 409, ErrorCode.INVALID_STATUS_TRANSITION,
        `정산이 COMMITTED 상태일 때만 확인(ACK)할 수 있습니다. 현재 상태: ${settlement.status}`,
        { current_status: settlement.status, required_status: 'COMMITTED' });
    }

    // D) 이미 ACK 존재하면 200 반환(멱등)
    const existingAck = await prisma.settlementAck.findUnique({
      where: { settlementId_userSub: { settlementId, userSub } },
    });
    if (existingAck) {
      return res.status(200).json({
        settlement_id: settlementId,
        acked: true,
        acked_at: existingAck.ackedAt.toISOString(),
        ack_user_sub: existingAck.userSub,
      });
    }

    // E) ACK 생성
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const ip = req.headers['x-forwarded-for'] as string || req.socket?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    try {
      const ack = await prisma.settlementAck.create({
        data: {
          settlementId,
          userSub,
          idempotencyKey: idempotencyKey || null,
          ip: ip || null,
          userAgent: userAgent || null,
        },
      });

      logger.info('SETTLEMENT_ACK_CREATED', { settlement_id: settlementId, user_sub: userSub });

      return res.status(201).json({
        settlement_id: settlementId,
        acked: true,
        acked_at: ack.ackedAt.toISOString(),
        ack_user_sub: ack.userSub,
      });
    } catch (err: any) {
      // unique 충돌(race condition) → 재조회
      if (err?.code === 'P2002') {
        const raceAck = await prisma.settlementAck.findUnique({
          where: { settlementId_userSub: { settlementId, userSub } },
        });
        if (raceAck) {
          return res.status(200).json({
            settlement_id: settlementId,
            acked: true,
            acked_at: raceAck.ackedAt.toISOString(),
            ack_user_sub: raceAck.userSub,
          });
        }
      }
      throw err;
    }
  } catch (error: any) {
    console.error('Error acking settlement:', error);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to ack settlement');
  }
};

/**
 * GET /user/v1/{targetType}/{targetId}/settlement/breakdown
 * 정산 breakdown 항목 조회 (tenant 격리)
 */
export const getBreakdown = async (req: Request, res: Response) => {
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
    } else if (targetType === 'LOT') {
      const lot = await prisma.lot.findUnique({ where: { id: targetId } });
      if (!lot || lot.tenantId !== tenantId) {
        return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Lot not found or access denied');
      }
    } else {
      return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'Invalid target type');
    }

    const settlement = await prisma.settlement.findFirst({
      where: { targetType, targetId },
      include: { breakdownItems: { orderBy: { createdAt: 'asc' } } },
    });

    if (!settlement) {
      return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Settlement not found');
    }

    return res.json(buildBreakdownResponse(settlement, settlement.breakdownItems));
  } catch (error: any) {
    console.error('Error getting breakdown:', error);
    return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to get breakdown');
  }
};

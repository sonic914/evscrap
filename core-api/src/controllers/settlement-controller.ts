import { Request, Response } from 'express';
import prisma from '../prisma';

export const createSettlement = async (req: Request, res: Response) => {
  try {
    const { targetType, targetId } = req.params;
    const { amount_total, amount_min, amount_bonus } = req.body;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate target type
    const validTargetTypes = ['CASE', 'LOT'];
    if (!validTargetTypes.includes(targetType)) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid target type. Must be CASE or LOT.' });
    }

    // Validate amount_total
    if (amount_total == null || typeof amount_total !== 'number' || amount_total <= 0) {
      return res.status(400).json({ error: 'ValidationError', message: 'amount_total is required and must be a positive number.' });
    }

    // Verify ownership
    if (targetType === 'CASE') {
      const kase = await prisma.case.findUnique({ where: { id: targetId } });
      if (!kase || kase.tenantId !== tenantId) {
        return res.status(404).json({ error: 'NotFound', message: 'Case not found or access denied' });
      }
    } else {
      const lot = await prisma.lot.findUnique({ where: { id: targetId } });
      if (!lot || lot.tenantId !== tenantId) {
        return res.status(404).json({ error: 'NotFound', message: 'Lot not found or access denied' });
      }
    }

    // Check for duplicate settlement
    const existing = await prisma.settlement.findFirst({
      where: { targetType, targetId },
    });
    if (existing) {
      return res.status(409).json({
        error: 'DuplicateSettlement',
        message: 'Settlement already exists for this target.',
        settlement_id: existing.id,
      });
    }

    // Create settlement
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

    return res.status(201).json(settlement);
  } catch (error: any) {
    console.error('Error creating settlement:', error);
    return res.status(500).json({ error: 'InternalServer', message: 'Failed to create settlement' });
  }
};

export const getSettlement = async (req: Request, res: Response) => {
  try {
     const { targetType, targetId } = req.params;
     const tenantId = req.user?.tenantId;

     if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify ownership
     if (targetType === 'CASE') {
        const kase = await prisma.case.findUnique({ where: { id: targetId } });
        if (!kase || kase.tenantId !== tenantId) return res.status(404).json({ error: 'NotFound' });
    } else {
         const lot = await prisma.lot.findUnique({ where: { id: targetId } });
        if (!lot || lot.tenantId !== tenantId) return res.status(404).json({ error: 'NotFound' });
    }

    const settlement = await prisma.settlement.findFirst({
        where: {
            targetType,
            targetId
        }
    });

    if (!settlement) {
         return res.status(404).json({ error: 'NotFound', message: 'Settlement not found' });
    }

    return res.json(settlement);

  } catch (error: any) {
    console.error('Error getting settlement:', error);
    return res.status(500).json({ error: 'InternalServer' });
  }
};

import { Request, Response } from 'express';
import prisma from '../prisma';

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

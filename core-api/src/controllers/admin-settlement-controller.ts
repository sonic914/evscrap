import { Request, Response } from 'express';
import prisma from '../prisma';

export const listSettlements = async (req: Request, res: Response) => {
    try {
        const { status } = req.query;
        const where = status ? { status: String(status) } : {};
        
        const settlements = await prisma.settlement.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
        return res.json({ settlements });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'InternalServer' });
    }
};

export const getSettlementById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const settlement = await prisma.settlement.findUnique({ where: { id } });
        
        if (!settlement) {
            return res.status(404).json({ error: 'NotFound' });
        }
        return res.json(settlement);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'InternalServer' });
    }
};

export const approveSettlement = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { notes } = req.body; // Notes might be stored in a separate table or log, here just placeholder
        
        // TODO: Verify if gate event has Verified Anchor.
        // Assuming there is a link from Settlement to Event (gate event).
        // The schema `Settlement` has `targetType` and `targetId`.
        // We need to find the specific "GATE" event for this target? 
        // e.g. `GRADING_COMPLETED` or `SETTLEMENT_REQUESTED`.
        // For MVP, we might skip the strict anchor check in code if not easily queryable, 
        // OR we query the latest event for this target.
        
        const settlement = await prisma.settlement.update({
            where: { id },
            data: {
                status: 'APPROVED',
                updatedAt: new Date()
            }
        });
        
        // TODO: Create SETTLEMENT_APPROVED event
        
        return res.json(settlement);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'InternalServer' });
    }
};

export const commitSettlement = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { receipt_hash } = req.body;
        
        const settlement = await prisma.settlement.update({
            where: { id },
            data: {
                status: 'COMMITTED',
                receiptHash: receipt_hash,
                updatedAt: new Date()
            }
        });
        
        // TODO: Create SETTLEMENT_COMMITTED event
        
        return res.json(settlement);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'InternalServer' });
    }
};

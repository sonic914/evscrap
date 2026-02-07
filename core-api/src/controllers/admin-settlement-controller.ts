import { Request, Response } from 'express';
import prisma from '../prisma';
import { toSnakeCaseKeys, errorResponse, ErrorCode } from '../utils/response';

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
        
        // 1. Settlement 조회
        const settlement = await prisma.settlement.findUnique({ where: { id } });
        if (!settlement) {
            return errorResponse(res, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Settlement not found');
        }
        
        // 2. 앵커 게이트: target에 연결된 모든 이벤트의 anchor 상태 확인
        const unverifiedEvents = await prisma.event.findMany({
            where: {
                targetType: settlement.targetType,
                targetId: settlement.targetId,
                anchorStatus: { not: 'VERIFIED' },
            },
            select: { id: true, eventType: true, anchorStatus: true },
        });
        
        if (unverifiedEvents.length > 0) {
            return errorResponse(res, 409, ErrorCode.ANCHOR_NOT_VERIFIED,
                `${unverifiedEvents.length} event(s) not yet verified. All events must be anchor-verified before approval.`,
                { unverified_events: unverifiedEvents.map(e => ({ event_id: e.id, event_type: e.eventType, anchor_status: e.anchorStatus })) });
        }
        
        // 3. 이벤트가 최소 1개 이상 존재해야 함
        const eventCount = await prisma.event.count({
            where: { targetType: settlement.targetType, targetId: settlement.targetId },
        });
        if (eventCount === 0) {
            return errorResponse(res, 409, ErrorCode.NO_EVENTS, 'No events found for this target. At least one verified event is required.');
        }
        
        // 4. 상태 전이 검증
        if (settlement.status !== 'DRAFT' && settlement.status !== 'READY_FOR_APPROVAL') {
            return errorResponse(res, 409, ErrorCode.INVALID_STATUS_TRANSITION, `Cannot approve settlement in '${settlement.status}' status. Must be DRAFT or READY_FOR_APPROVAL.`);
        }
        
        // 5. Approve
        const updated = await prisma.settlement.update({
            where: { id },
            data: {
                status: 'APPROVED',
                updatedAt: new Date(),
            },
        });
        
        return res.json(toSnakeCaseKeys(updated));
    } catch (error) {
        console.error('Error approving settlement:', error);
        return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to approve settlement');
    }
};

export const commitSettlement = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { receipt_hash } = req.body;
        
        // 1. Settlement 조회
        const settlement = await prisma.settlement.findUnique({ where: { id } });
        if (!settlement) {
            return res.status(404).json({ error: 'NotFound', message: 'Settlement not found' });
        }
        
        // 2. 앵커 게이트: 동일 검증
        const unverifiedEvents = await prisma.event.findMany({
            where: {
                targetType: settlement.targetType,
                targetId: settlement.targetId,
                anchorStatus: { not: 'VERIFIED' },
            },
            select: { id: true, eventType: true, anchorStatus: true },
        });
        
        if (unverifiedEvents.length > 0) {
            return errorResponse(res, 409, ErrorCode.ANCHOR_NOT_VERIFIED,
                `${unverifiedEvents.length} event(s) not yet verified. All events must be anchor-verified before commit.`,
                { unverified_events: unverifiedEvents.map(e => ({ event_id: e.id, event_type: e.eventType, anchor_status: e.anchorStatus })) });
        }
        
        // 3. 상태 전이 검증: APPROVED만 commit 가능
        if (settlement.status !== 'APPROVED') {
            return errorResponse(res, 409, ErrorCode.INVALID_STATUS_TRANSITION, `Cannot commit settlement in '${settlement.status}' status. Must be APPROVED first.`);
        }
        
        // 4. receipt_hash 필수
        if (!receipt_hash) {
            return errorResponse(res, 400, ErrorCode.VALIDATION_ERROR, 'receipt_hash is required for commit.');
        }
        
        // 5. Commit
        const updated = await prisma.settlement.update({
            where: { id },
            data: {
                status: 'COMMITTED',
                receiptHash: receipt_hash,
                updatedAt: new Date(),
            },
        });
        
        return res.json(toSnakeCaseKeys(updated));
    } catch (error) {
        console.error('Error committing settlement:', error);
        return errorResponse(res, 500, ErrorCode.INTERNAL_ERROR, 'Failed to commit settlement');
    }
};

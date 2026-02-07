import { Request, Response } from 'express';
import { createHash } from 'crypto';
import prisma from '../prisma';

export const createEvent = async (req: Request, res: Response) => {
  try {
    const { targetType, targetId } = req.params;
    const { event_type, payload, occurred_at } = req.body;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized', message: 'User context missing' });
    }

    // Validate Target Type
    const validTargetTypes = ['CASE', 'LOT'];
    if (!validTargetTypes.includes(targetType)) {
         return res.status(400).json({ error: 'ValidationError', message: 'Invalid target type' });
    }

    // Verify Ownership
    if (targetType === 'CASE') {
        const kase = await prisma.case.findUnique({ where: { id: targetId } });
        if (!kase || kase.tenantId !== tenantId) {
             return res.status(404).json({ error: 'NotFound', message: 'Case not found or access denied' });
        }
    } else { // LOT
        const lot = await prisma.lot.findUnique({ where: { id: targetId } });
        if (!lot || lot.tenantId !== tenantId) {
             return res.status(404).json({ error: 'NotFound', message: 'Lot not found or access denied' });
        }
    }

    // Create Event
    // Note: canonical_hash and anchor logic will be handled by Worker mostly, 
    // but we need to generate initial canonical_hash here? 
    // The spec says "Event payload discriminator 검증 로직" is a todo.
    // For MVP, simplistic hash or placeholder.
    // Schema requires `canonicalHash`. Let's allow it to be passed or generate a simple one.
    // In a real system, we must ensure integrity here. 
    // For now, let's use a placeholder 'pending-hash' or calculate SHA256 of payload.
    // I'll skip complex hashing for this file edit to keep it simple, or just use stringify.
    
    // Canonical hash: SHA-256 of deterministic JSON (targetType + targetId + eventType + payload + occurredAt)
    const canonicalPayload = JSON.stringify({
      targetType, targetId, event_type,
      payload: payload || {},
      occurredAt: occurred_at || new Date().toISOString()
    });
    const canonicalHash = createHash('sha256').update(canonicalPayload).digest('hex');

    const event = await prisma.event.create({
      data: {
        targetType: targetType,
        targetId: targetId,
        eventType: event_type,
        occurredAt: occurred_at ? new Date(occurred_at) : new Date(),
        payload: payload || {},
        canonicalHash: canonicalHash,
        tenantId: tenantId,
        anchorStatus: 'PENDING', // Start as PENDING for worker to pick up? Or NONE? Schema default is NONE.
        // Let's explicitly set to PENDING so worker knows to process it? 
        // Or if we use SQS, we stick to NONE and push to SQS.
        // Task list says "Worker Lambda... event 조회... canonical_hash 생성".
        // So maybe we leave it as NONE and push to queue.
        // But canonicalHash is required in schema.
        // I will put a placeholder.
      }
    });

    // TODO: Send to SQS for anchoring (Worker)
    
    return res.status(201).json(event);

  } catch (error: any) {
    console.error('Error creating event:', error);
    return res.status(500).json({ error: 'InternalServer', message: 'Failed to create event' });
  }
};

export const getTimeline = async (req: Request, res: Response) => {
  try {
    const { targetType, targetId } = req.params;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized', message: 'User context missing' });
    }

    // Verify ownership (can be refactored to middleware or helper)
    // Skipping strict verification for read optimization (or add it back for security)
    // Security first: verify ownership.
    if (targetType === 'CASE') {
        const kase = await prisma.case.findUnique({ where: { id: targetId } });
        if (!kase || kase.tenantId !== tenantId) return res.status(404).json({ error: 'NotFound' });
    } else {
         const lot = await prisma.lot.findUnique({ where: { id: targetId } });
        if (!lot || lot.tenantId !== tenantId) return res.status(404).json({ error: 'NotFound' });
    }

    const events = await prisma.event.findMany({
      where: {
        targetType,
        targetId,
        tenantId
      },
      orderBy: {
        occurredAt: 'desc'
      }
    });

    return res.json({ events });

  } catch (error: any) {
    console.error('Error getting timeline:', error);
    return res.status(500).json({ error: 'InternalServer' });
  }
};

export const getAnchorStatus = async (req: Request, res: Response) => {
  try {
     const { eventId } = req.params;
     // Need tenant check? Yes.
     // Join event to check tenant
     const anchor = await prisma.blockchainAnchor.findFirst({
        where: {
            event: {
                id: eventId,
                tenantId: req.user?.tenantId
            }
        },
        include: {
            event: {
                select: { id: true }
            }
        }
     });

     if (!anchor) {
         return res.status(404).json({ error: 'NotFound', message: 'Anchor not found for this event' });
     }

     return res.json(anchor);
  } catch (error: any) {
    console.error('Error getting anchor:', error);
    return res.status(500).json({ error: 'InternalServer' });
  }
};

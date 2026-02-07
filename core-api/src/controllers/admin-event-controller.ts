import { Request, Response } from 'express';
import prisma from '../prisma';

export const listEvents = async (req: Request, res: Response) => {
  try {
      const { target_type, event_type, anchor_status } = req.query;
      const where: any = {};
      if (target_type) where.targetType = String(target_type);
      if (event_type) where.eventType = String(event_type);
      if (anchor_status) where.anchorStatus = String(anchor_status);

      const events = await prisma.event.findMany({
          where,
          orderBy: { occurredAt: 'desc' },
          take: 50 // pagination later
      });
      return res.json({ events });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'InternalServer' });
  }
};

export const getEvent = async (req: Request, res: Response) => {
  try {
     const { eventId } = req.params;
     const event = await prisma.event.findUnique({ where: { id: eventId } });
     if (!event) return res.status(404).json({ error: 'NotFound' });
     return res.json(event);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'InternalServer' });
  }
};

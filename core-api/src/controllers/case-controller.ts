import { Request, Response } from 'express';
import prisma from '../prisma';

export const createCase = async (req: Request, res: Response) => {
  try {
    const { vin, make, model, year } = req.body;
    
    // Auth context
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized', message: 'User context missing' });
    }

    // Validation
    if (!vin) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Missing required field: vin'
      });
    }

    // Create Case
    const newCase = await prisma.case.create({
      data: {
        vin,
        make,
        model,
        year,
        tenantId: tenantId
      }
    });

    // TODO: Create CASE_CREATED Event (as per spec/design, usually side-effect)
    // For MVP Phase 1-B, we focus on DB record. 
    // Event sourcing logic will be added in "Event payload discriminator" task or Service layer.

    return res.status(201).json(newCase);

  } catch (error: any) {
    console.error('Error creating case:', error);
    return res.status(500).json({
      error: 'InternalServer',
      message: 'Failed to create case'
    });
  }
};

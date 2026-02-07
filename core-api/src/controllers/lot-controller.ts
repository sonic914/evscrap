import { Request, Response } from 'express';
import prisma from '../prisma';

export const createLot = async (req: Request, res: Response) => {
  try {
    const { parent_case_id, part_type, quantity, weight_kg } = req.body;
    
    // Auth context
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized', message: 'User context missing' });
    }

    // Validation
    if (!part_type) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Missing required field: part_type'
      });
    }

    // Optional: Validate parent_case_id if provided
    if (parent_case_id) {
        const parentCase = await prisma.case.findUnique({
            where: { id: parent_case_id }
        });
        if (!parentCase) {
             return res.status(404).json({
                error: 'NotFound',
                message: `Parent case not found: ${parent_case_id}`
            });
        }
        // Verify tenant ownership of case
        if (parentCase.tenantId !== tenantId) {
             return res.status(403).json({
                error: 'Forbidden',
                message: 'Access denied to parent case'
            });
        }
    }

    // Create Lot
    const newLot = await prisma.lot.create({
      data: {
        parentCaseId: parent_case_id || null, // Handle undefined/empty string
        partType: part_type,
        quantity: quantity || 1,
        weightKg: weight_kg,
        tenantId: tenantId
      }
    });

    return res.status(201).json(newLot);

  } catch (error: any) {
    console.error('Error creating lot:', error);
    return res.status(500).json({
      error: 'InternalServer',
      message: 'Failed to create lot'
    });
  }
};

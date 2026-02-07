import { Request, Response } from 'express';
import prisma from '../prisma';

export const createPolicy = async (req: Request, res: Response) => {
    try {
        const { policy_type, version, policy_body } = req.body;
        
        // Basic Validation
        if (!policy_type || !version || !policy_body) {
             return res.status(400).json({ error: 'ValidationError', message: 'Missing required fields' });
        }
        
        const policy = await prisma.policy.create({
            data: {
                policyType: policy_type,
                version: version,
                policyBody: policy_body,
                isActive: false // Default to inactive
            }
        });
        
        return res.status(201).json(policy);
    } catch (error: any) {
        console.error(error);
        if (error.code === 'P2002') {
             return res.status(409).json({ error: 'Conflict', message: 'Policy version already exists' });
        }
        return res.status(500).json({ error: 'InternalServer' });
    }
};

export const activatePolicy = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        
        // Deactivate other policies of same type? Schema doesn't enforce single active, but business logic might.
        // For MVP, let's just activate this one.
        // A robust system would transactionally deactivate others.
        
        // Find policy to get type
        const policyToActivate = await prisma.policy.findUnique({ where: { id } });
        if (!policyToActivate) return res.status(404).json({ error: 'NotFound' });
        
        // Transaction: Deactivate same type, Activate target
        await prisma.$transaction([
            prisma.policy.updateMany({
                where: { 
                    policyType: policyToActivate.policyType,
                    id: { not: id }, // Optional: deactivate excluding target
                    isActive: true
                },
                data: { isActive: false }
            }),
            prisma.policy.update({
                where: { id },
                data: { isActive: true }
            })
        ]);
        
        return res.json({ message: 'Policy activated', policyId: id });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'InternalServer' });
    }
};

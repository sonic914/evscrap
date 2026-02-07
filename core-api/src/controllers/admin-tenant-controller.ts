import { Request, Response } from 'express';
import prisma from '../prisma';

export const listTenants = async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const where = status ? { status: String(status) } : {};
    
    const tenants = await prisma.tenant.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ tenants });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'InternalServer' });
  }
};

export const getTenant = async (req: Request, res: Response) => {
  try {
     const { id } = req.params;
     const tenant = await prisma.tenant.findUnique({ where: { id } });
     if (!tenant) return res.status(404).json({ error: 'NotFound' });
     return res.json(tenant);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'InternalServer' });
  }
};

export const approveTenant = async (req: Request, res: Response) => {
  try {
     const { id } = req.params;
     const { notes } = req.body;
     
     // TODO: Transaction? 
     const tenant = await prisma.tenant.update({
        where: { id },
        data: {
            status: 'APPROVED',
            approvedAt: new Date(),
            approvedBy: 'admin' // In real auth, get from token
        }
     });
     
     // TODO: Create TENANT_APPROVED event
     
     return res.json(tenant);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'InternalServer' });
  }
};

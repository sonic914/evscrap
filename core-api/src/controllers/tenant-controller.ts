import { Request, Response } from 'express';
import prisma from '../prisma';

export const submitTenant = async (req: Request, res: Response) => {
  try {
    const { display_name, phone_number, business_number, address } = req.body;

    // Basic Validation
    if (!display_name || !phone_number) {
       return res.status(400).json({
        error: 'ValidationError',
        message: 'Missing required fields: display_name, phone_number'
      });
    }

    // Phone number regex check (basic)
    const phoneRegex = /^\+82[0-9]{9,11}$/;
    if (!phoneRegex.test(phone_number)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid phone number format. Must be E.164 (+82...)'
      });
    }

    // Create Tenant
    // Note: status defaults to PENDING in schema
    const tenant = await prisma.tenant.create({
      data: {
        displayName: display_name,
        phoneNumber: phone_number,
        businessNumber: business_number,
        address: address,
        status: 'PENDING'
      }
    });

    return res.status(201).json(tenant);

  } catch (error: any) {
    console.error('Error submitting tenant:', error);
    return res.status(500).json({
      error: 'InternalServer',
      message: 'Failed to submit tenant'
    });
  }
};

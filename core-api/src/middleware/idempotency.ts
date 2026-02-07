import { Request, Response, NextFunction } from 'express';
import prisma from '../prisma';
import crypto from 'crypto';

export const idempotency = async (req: Request, res: Response, next: NextFunction) => {
    const key = req.headers['idempotency-key'] as string;

    if (!key) {
        return next();
    }

    try {
        // Check for existing record
        const record = await prisma.idempotencyRecord.findUnique({
            where: { key }
        });

        if (record) {
            // Check if request matches (simple hash check of body)
            // Note: In real world, we might want to be more strict or lenient.
            // For MVP, if key matches, return cached response.
            // But we should verify it's the same request to avoid collisions/misuse.
            const currentHash = crypto.createHash('sha256')
                .update(JSON.stringify(req.body || {}))
                .digest('hex');
            
            if (record.requestHash !== currentHash) {
                return res.status(409).json({ 
                    error: 'Conflict', 
                    message: 'Idempotency key reuse detected with different payload' 
                });
            }

            console.log(`[Idempotency] Hit: ${key}`);
            return res.status(200).json(record.responseBody); // Assuming stored response was 200 OK mostly? 
            // We should ideally store status code too. Schema `responseBody` is Json.
            // But Schema doesn't have statusCode column.
            // Workaround: wrap body in { data: ... } or just return body.
            // If the original response had a status code, we lose it unless we store it.
            // For MVP, let's assume successful processing (200/201) are cached.
        }

        // If not found, hijack response.send/json
        const originalSend = res.json;
        const hash = crypto.createHash('sha256')
            .update(JSON.stringify(req.body || {}))
            .digest('hex');

        res.json = function (body) {
            // Save to DB asynchronously (fire and forget or await?)
            // Await to ensure consistency? 
            // But we can't await easily in this override without making it async wrapper?
            
            // Note: res.json calls res.send.
            // Capture status code
            const statusCode = res.statusCode;

            // Only cache successful idempotent operations?
            // Usually 2xx. 4xx/5xx might not be worth caching or should be retried.
            if (statusCode >= 200 && statusCode < 300) {
                 prisma.idempotencyRecord.create({
                    data: {
                        key,
                        endpoint: req.originalUrl,
                        tenantId: (req as any).user?.tenantId, // Optional link
                        requestHash: hash,
                        responseBody: body
                    }
                }).catch(err => console.error('[Idempotency] Save failed:', err));
            }

            return originalSend.call(this, body);
        };

        next();

    } catch (error) {
        console.error('[Idempotency] Error:', error);
        next(); // Fail open or closed? Fail open for now.
    }
};

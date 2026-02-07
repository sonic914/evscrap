import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as tenantController from '../controllers/tenant-controller';
import * as caseController from '../controllers/case-controller';
import * as lotController from '../controllers/lot-controller';
import * as evidenceController from '../controllers/evidence-controller';
import * as eventController from '../controllers/event-controller';
import * as settlementController from '../controllers/settlement-controller';

const router = Router();

// Apply Auth Middleware
router.use(requireAuth);

// Tenants
router.post('/tenants/submit', tenantController.submitTenant);

// Cases
router.post('/cases', caseController.createCase);

// Lots
router.post('/lots', lotController.createLot);

// Evidence
router.post('/evidence/presign', evidenceController.createPresignedUrl);
router.post('/evidence', evidenceController.registerEvidence);

// Events
router.post('/:targetType/:targetId/events', eventController.createEvent);
router.get('/:targetType/:targetId/timeline', eventController.getTimeline);
router.get('/events/:eventId/anchor', eventController.getAnchorStatus);

// Settlement
router.get('/:targetType/:targetId/settlement', settlementController.getSettlement);

// Current User (Placeholder)
router.get('/me', (req, res) => {
  res.json({ message: 'Me endpoint not implemented' });
});

export default router;

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { idempotency } from '../middleware/idempotency';
import * as tenantController from '../controllers/tenant-controller';
import * as caseController from '../controllers/case-controller';
import * as lotController from '../controllers/lot-controller';
import * as evidenceController from '../controllers/evidence-controller';
import * as eventController from '../controllers/event-controller';
import * as settlementController from '../controllers/settlement-controller';

const router = Router();

// Apply Auth Middleware
router.use(requireAuth);

// Tenants (Idempotency-Key 지원)
router.post('/tenants/submit', idempotency, tenantController.submitTenant);

// Cases (Idempotency-Key 지원)
router.post('/cases', idempotency, caseController.createCase);

// Lots (Idempotency-Key 지원)
router.post('/lots', idempotency, lotController.createLot);

// Evidence (Idempotency-Key 지원)
router.post('/evidence/presign', evidenceController.createPresignedUrl);
router.post('/evidence', idempotency, evidenceController.registerEvidence);

// Settlement list (정적 경로, 동적 라우트보다 먼저)
router.get('/settlements', settlementController.listSettlements);

// Evidence list by target
router.get('/:targetType/:targetId/evidence', evidenceController.listEvidenceByTarget);

// Events (Idempotency-Key 지원)
router.post('/:targetType/:targetId/events', idempotency, eventController.createEvent);
router.get('/:targetType/:targetId/timeline', eventController.getTimeline);
router.get('/events/:eventId/anchor', eventController.getAnchorStatus);

// Settlement (single)
router.post('/:targetType/:targetId/settlement', settlementController.createSettlement);
router.get('/:targetType/:targetId/settlement', settlementController.getSettlement);

// Current User (Placeholder)
router.get('/me', (req, res) => {
  res.json({ message: 'Me endpoint not implemented' });
});

export default router;

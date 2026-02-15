import { Router } from 'express';
import * as tenantController from '../controllers/admin-tenant-controller';
import * as eventController from '../controllers/admin-event-controller';
import * as settlementController from '../controllers/admin-settlement-controller';
import * as policyController from '../controllers/admin-policy-controller';
import * as caseController from '../controllers/admin-case-controller';
import * as timelineController from '../controllers/admin-timeline-controller';
import * as evidenceController from '../controllers/admin-evidence-controller';
import { requireAdminAuth } from '../middleware/admin-auth';

const router = Router();
router.use(requireAdminAuth);

// Tenants
router.get('/tenants', tenantController.listTenants);
router.get('/tenants/:id', tenantController.getTenant);
router.post('/tenants/:id/approve', tenantController.approveTenant);

// Cases (P2-1.5)
router.get('/cases', caseController.listCases);
router.get('/cases/:caseId', caseController.getCaseDetail);

// Events
router.get('/events', eventController.listEvents);
router.get('/events/:eventId', eventController.getEvent);

// Timeline (P2-1.5) — targetType: CASE | LOT
router.get('/:targetType/:targetId/timeline', timelineController.getTimeline);

// Evidence (P2-1.5) — tenant_id 기준 조회 + presigned GET URL
router.get('/evidence', evidenceController.listEvidence);

// Settlements
router.get('/settlements', settlementController.listSettlements);
router.get('/settlements/:id', settlementController.getSettlementById);
router.post('/settlements/:id/approve', settlementController.approveSettlement);
router.post('/settlements/:id/commit', settlementController.commitSettlement);

// Policies
router.post('/policies', policyController.createPolicy);
router.post('/policies/:id/activate', policyController.activatePolicy);

// Audit
router.get('/audit/missing-anchors', (req, res) => {
    res.json({ missing_anchors: [] });
});

export default router;

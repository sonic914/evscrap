import { Router } from 'express';
import * as tenantController from '../controllers/admin-tenant-controller';
import * as eventController from '../controllers/admin-event-controller';
import * as settlementController from '../controllers/admin-settlement-controller';
import * as policyController from '../controllers/admin-policy-controller';
import { requireAdminAuth } from '../middleware/admin-auth';

const router = Router();
router.use(requireAdminAuth);

// Tenants
router.get('/tenants', tenantController.listTenants);
router.get('/tenants/:id', tenantController.getTenant);
router.post('/tenants/:id/approve', tenantController.approveTenant);

// Events
router.get('/events', eventController.listEvents);
router.get('/events/:eventId', eventController.getEvent);

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

import express from 'express';
import cors from 'cors'; // Try importing cors types? If not installed, might fail.
// If cors is not installed, use manual middleware.
// Let's assume manual for safety as I didn't see cors in package.json
import userRoutes from './routes/user';
import adminRoutes from './routes/admin';

import { idempotency } from './middleware/idempotency';

const app = express();

// JSON parsing
app.use(express.json());

// CORS Config
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
});

// Idempotency Middleware (Global for simplicity, or select routes)
app.use(idempotency);

// Routes
app.use('/user/v1', userRoutes);
app.use('/admin/v1', adminRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0-phase1b'
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`
  });
});

export default app;

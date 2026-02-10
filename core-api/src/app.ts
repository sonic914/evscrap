import express from 'express';
import userRoutes from './routes/user';
import adminRoutes from './routes/admin';
import { requestLogger } from './middleware/request-logger';
import logger from './utils/logger';

const app = express();

// JSON parsing
app.use(express.json());

// CORS Config
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key, x-correlation-id');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
});

// 구조화 로그 + correlation_id (모든 요청에 적용)
app.use(requestLogger);

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
  logger.warn('NOT_FOUND', { method: req.method, path: req.path });
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`
  });
});

export default app;

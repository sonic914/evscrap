import express, { Request, Response } from 'express';
import dotenv from 'dotenv';

// 환경 변수 로드
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// JSON 파싱
app.use(express.json());

// CORS 설정
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
});

// Health Check 공통 응답 함수
const healthResponse = (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  const path = req.path;

  const response = {
    status: 'healthy',
    timestamp,
    path,
    version: '0.1.0-phase0a',
    environment: {
      bucketName: process.env.BUCKET_NAME || 'not-set',
      userPoolId: process.env.USER_POOL_ID || 'not-set',
      adminPoolId: process.env.ADMIN_POOL_ID || 'not-set',
    },
  };

  console.log(`[${timestamp}] Health check: ${path}`);
  res.json(response);
};

// Health Check 엔드포인트
app.get('/health', healthResponse);
app.get('/user/v1/health', healthResponse);
app.get('/admin/v1/health', healthResponse);

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`,
  });
});

// 에러 핸들러
app.use((err: Error, req: Request, res: Response) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`evscrap Core API - Local Development Server`);
  console.log(`===========================================`);
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  - GET http://localhost:${PORT}/health`);
  console.log(`  - GET http://localhost:${PORT}/user/v1/health`);
  console.log(`  - GET http://localhost:${PORT}/admin/v1/health`);
  console.log(`===========================================\n`);
});

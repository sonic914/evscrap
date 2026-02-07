import serverlessExpress from '@vendia/serverless-express';
import app from '../app';

/**
 * API Lambda Handler
 * 
 * Express 앱을 AWS Lambda에서 실행하기 위한 어댑터.
 * API Gateway {proxy+} → 이 핸들러 → Express 라우팅
 */
export const handler = serverlessExpress({ app });

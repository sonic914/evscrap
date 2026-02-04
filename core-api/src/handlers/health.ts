import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * Health Check Lambda Handler
 * 
 * 엔드포인트:
 * - GET /health
 * - GET /user/v1/health
 * - GET /admin/v1/health
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const path = event.path || '/';
  const timestamp = new Date().toISOString();

  console.log(`Health check requested: ${path}`);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      status: 'healthy',
      timestamp,
      path,
      version: '0.1.0-phase0a',
      environment: {
        bucketName: process.env.BUCKET_NAME || 'not-set',
        userPoolId: process.env.USER_POOL_ID || 'not-set',
        adminPoolId: process.env.ADMIN_POOL_ID || 'not-set',
      },
    }),
  };
};

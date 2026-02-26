/**
 * P1: 응답 snake_case 변환
 * P2: ErrorResponse 표준화
 */

// camelCase → snake_case 변환
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// 객체의 키를 snake_case로 변환 (재귀)
export function toSnakeCaseKeys(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCaseKeys);
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = toSnakeCase(key);
    // JSON 타입 필드는 재귀 변환하지 않음 (payload, policyRefs 등)
    if (key === 'payload' || key === 'policyBody' || key === 'policy_body') {
      result[snakeKey] = value;
    } else {
      result[snakeKey] = toSnakeCaseKeys(value);
    }
  }
  return result;
}

// 표준 에러 응답 (OpenAPI ErrorResponse 스펙 준수)
export function errorResponse(
  res: any,
  statusCode: number,
  errorCode: string,
  message: string,
  details?: Record<string, any>
) {
  const body: Record<string, any> = {
    error_code: errorCode,
    message,
  };
  if (details) body.details = details;
  return res.status(statusCode).json(body);
}

// 표준 에러 코드 (OpenAPI enum)
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  ANCHOR_NOT_VERIFIED: 'ANCHOR_NOT_VERIFIED',
  TENANT_NOT_APPROVED: 'TENANT_NOT_APPROVED',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  NO_EVENTS: 'NO_EVENTS',
  MISSING_IDEMPOTENCY_KEY: 'MISSING_IDEMPOTENCY_KEY',
} as const;

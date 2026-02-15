/**
 * @evscrap/api-client
 *
 * OpenAPI 기반 타입 안전 API 클라이언트.
 * 관리자웹/사용자PWA에서 동일하게 import하여 사용.
 */
export { createApiClient, type ApiClient, type ApiClientOptions } from './client';
export type { paths, components, operations } from './generated/openapi-types';

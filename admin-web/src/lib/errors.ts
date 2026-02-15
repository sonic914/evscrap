/**
 * API 에러 표준화
 *
 * 보수적 원칙:
 * - 409 ANCHOR_NOT_VERIFIED → "앵커링 검증 전이라 정산 불가" 안내
 * - 409 IDEMPOTENCY_* → "중복 요청" 안내
 * - 사용자에게 명확한 메시지 제공
 */

export interface ApiErrorInfo {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  isAnchorGate?: boolean;
}

/**
 * API 에러 응답을 사용자 친화 메시지로 변환
 */
export function mapApiError(error: unknown): ApiErrorInfo {
  if (error && typeof error === 'object' && 'error_code' in error) {
    const e = error as {
      error_code: string;
      message: string;
      details?: Record<string, unknown>;
    };

    switch (e.error_code) {
      case 'ANCHOR_NOT_VERIFIED':
        return {
          code: e.error_code,
          message:
            '블록체인 앵커링 검증(VERIFIED) 전이라 정산을 진행할 수 없습니다. 앵커 워커 처리 후 다시 시도하세요.',
          details: e.details,
          isAnchorGate: true,
        };

      case 'IDEMPOTENCY_CONFLICT':
      case 'IDEMPOTENCY_MISMATCH':
        return {
          code: e.error_code,
          message: '중복 요청으로 방지되었습니다.',
          details: e.details,
        };

      case 'INVALID_STATUS_TRANSITION':
      case 'NO_EVENTS':
        return {
          code: e.error_code,
          message: e.message || '현재 상태에서 수행할 수 없는 작업입니다.',
          details: e.details,
        };

      case 'RESOURCE_NOT_FOUND':
        return {
          code: e.error_code,
          message: '요청한 리소스를 찾을 수 없습니다.',
        };

      case 'VALIDATION_ERROR':
        return {
          code: e.error_code,
          message: e.message || '입력 값이 올바르지 않습니다.',
          details: e.details,
        };

      case 'UNAUTHORIZED':
        return {
          code: e.error_code,
          message: '인증이 필요합니다. 다시 로그인해주세요.',
        };

      default:
        return {
          code: e.error_code,
          message: e.message || '알 수 없는 오류가 발생했습니다.',
          details: e.details,
        };
    }
  }

  return {
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : '알 수 없는 오류',
  };
}

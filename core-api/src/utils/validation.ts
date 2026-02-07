/**
 * Event payload discriminator 검증
 * OpenAPI 스펙의 EventCreateRequest discriminator 매핑에 따른 필수 필드 검증
 */

const VALID_REUSE_GRADES = ['A', 'B', 'C', 'UNKNOWN'];
const VALID_RECYCLE_GRADES = ['A', 'B', 'C', 'UNKNOWN'];

const VALID_EVENT_TYPES = [
  'TENANT_SUBMITTED', 'TENANT_APPROVED', 'CASE_CREATED', 'LOT_CREATED',
  'M0_QUOTED', 'INBOUND_CHECKED', 'GRADING_COMPLETED',
  'DELTA_CALCULATED', 'SETTLEMENT_APPROVED', 'SETTLEMENT_COMMITTED',
];

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateEventPayload(eventType: string, payload: any): ValidationResult {
  const errors: string[] = [];

  // 1. event_type 자체 검증
  if (!eventType) {
    errors.push('event_type is required');
    return { valid: false, errors };
  }
  if (!VALID_EVENT_TYPES.includes(eventType)) {
    errors.push(`Invalid event_type: '${eventType}'. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`);
    return { valid: false, errors };
  }

  // 2. payload 필수
  if (!payload || typeof payload !== 'object') {
    errors.push('payload is required and must be an object');
    return { valid: false, errors };
  }

  // 3. discriminator별 payload 검증
  switch (eventType) {
    case 'GRADING_COMPLETED':
      if (!payload.reuse_grade) {
        errors.push('payload.reuse_grade is required for GRADING_COMPLETED');
      } else if (!VALID_REUSE_GRADES.includes(payload.reuse_grade)) {
        errors.push(`payload.reuse_grade must be one of: ${VALID_REUSE_GRADES.join(', ')}`);
      }
      if (!payload.recycle_grade) {
        errors.push('payload.recycle_grade is required for GRADING_COMPLETED');
      } else if (!VALID_RECYCLE_GRADES.includes(payload.recycle_grade)) {
        errors.push(`payload.recycle_grade must be one of: ${VALID_RECYCLE_GRADES.join(', ')}`);
      }
      break;

    case 'INBOUND_CHECKED':
      // inspector_id, checked_at은 optional (스펙상 required 아님)
      break;

    case 'DELTA_CALCULATED':
      // delta_amount, policy_version은 optional
      break;

    case 'SETTLEMENT_APPROVED':
      // approved_by, approved_amount은 optional
      break;

    case 'SETTLEMENT_COMMITTED':
      // committed_by, receipt_hash은 optional
      break;

    // Generic: TENANT_SUBMITTED, TENANT_APPROVED, CASE_CREATED, LOT_CREATED, M0_QUOTED
    default:
      // payload는 자유 형식
      break;
  }

  return { valid: errors.length === 0, errors };
}

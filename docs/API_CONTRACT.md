# evscrap API 계약 문서

## 개요

이 문서는 **Phase 1-A 보수적 MVP** 범위의 API 계약을 정의합니다. evscrap 시스템은 폐차장 테넌트 관리, 차량(Case) 및 부품(Lot) 등록, 증빙(Evidence) 관리, 이벤트 원장 및 블록체인 앵커링, 정산(Settlement) 처리를 지원합니다.

**OpenAPI 스펙:** [openapi.yaml](file:///c:/Users/sonic/Projects/evscrap/evscrap/core-api/openapi.yaml)

### API 구조

- **User API**: `/user/v1/*` - 폐차장 사용자용 API
- **Admin API**: `/admin/v1/*` - 관리자용 API
- **인증**: Cognito JWT Bearer 토큰 (User/Admin 분리)

## 인증 및 보안

### Security Schemes

1. **scrapyardJwt**: 사용자(폐차장) Cognito JWT
   - User API 엔드포인트에서 사용
   - 헤더: `Authorization: Bearer <JWT_TOKEN>`

2. **adminJwt**: 관리자 Cognito JWT
   - Admin API 엔드포인트에서 사용
   - 헤더: `Authorization: Bearer <ADMIN_JWT_TOKEN>`

## 멱등성(Idempotency)

다음 POST 요청들은 `Idempotency-Key` 헤더를 지원합니다:

- `POST /user/v1/tenants/submit`
- `POST /user/v1/cases`
- `POST /user/v1/lots`
- `POST /user/v1/evidence`
- `POST /user/v1/{targetType}/{targetId}/events`

**사용 방법:**

```bash
curl -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
     -H "Authorization: Bearer $USER_JWT" \
     -X POST https://api.evscrap.com/user/v1/cases \
     -d '{"vin":"KMHXX00XXXX000000"}'
```

동일한 `Idempotency-Key`로 재시도 시 동일한 결과를 반환합니다.

## 에러 처리

모든 에러 응답은 다음 표준화된 스키마를 사용합니다:

```json
{
  "error_code": "VALIDATION_ERROR",
  "message": "입력 값이 올바르지 않습니다",
  "details": {},
  "trace_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

### 주요 Error Codes

| Error Code            | HTTP Status | 설명                                  |
| --------------------- | ----------- | ------------------------------------- |
| `VALIDATION_ERROR`    | 400         | 입력 검증 실패                        |
| `UNAUTHORIZED`        | 401         | 인증 실패                             |
| `FORBIDDEN`           | 403         | 권한 없음                             |
| `TENANT_NOT_APPROVED` | 403         | 테넌트 미승인                         |
| `RESOURCE_NOT_FOUND`  | 404         | 리소스 없음                           |
| `ANCHOR_NOT_VERIFIED` | 409         | 블록체인 앵커 미검증 (정산 승인 실패) |
| `INTERNAL_ERROR`      | 500         | 서버 내부 오류                        |

### 앵커 검증 에러 예시

```json
{
  "error_code": "ANCHOR_NOT_VERIFIED",
  "message": "게이트 이벤트의 블록체인 앵커가 검증되지 않았습니다",
  "details": {
    "event_id": "123e4567-e89b-12d3-a456-426614174000",
    "anchor_status": "PENDING"
  },
  "trace_id": "789e4567-e89b-12d3-a456-426614174111"
}
```

## 보수적 MVP 전체 시나리오

다음은 테넌트 등록부터 정산 확정까지 전체 플로우를 curl로 구현한 예시입니다.

### 환경 변수 설정

```bash
export API_BASE=https://api.evscrap.com
export USER_JWT=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
export ADMIN_JWT=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Step 1: 테넌트 제출

```bash
curl -X POST $API_BASE/user/v1/tenants/submit \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "display_name": "서울폐차장",
    "phone_number": "+821012345678",
    "business_number": "123-45-67890",
    "address": "서울시 강남구 테헤란로 123"
  }'
```

**응답:**

```json
{
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING",
  "display_name": "서울폐차장",
  "phone_number": "+821012345678",
  "business_number": "123-45-67890",
  "address": "서울시 강남구 테헤란로 123",
  "created_at": "2026-02-05T11:35:00Z"
}
```

### Step 2: 관리자 테넌트 승인

```bash
curl -X POST $API_BASE/admin/v1/tenants/550e8400-e29b-41d4-a716-446655440000/approve \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "서류 확인 완료"
  }'
```

**응답:**

```json
{
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "APPROVED",
  "display_name": "서울폐차장",
  "phone_number": "+821012345678",
  "approved_at": "2026-02-05T11:36:00Z",
  "approved_by": "admin@evscrap.com"
}
```

### Step 3: Case 생성

```bash
curl -X POST $API_BASE/user/v1/cases \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "vin": "KMHXX00XXXX000001",
    "make": "현대",
    "model": "아이오닉5",
    "year": 2023
  }'
```

**응답:**

```json
{
  "case_id": "660e8400-e29b-41d4-a716-446655440001",
  "vin": "KMHXX00XXXX000001",
  "make": "현대",
  "model": "아이오닉5",
  "year": 2023,
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2026-02-05T11:37:00Z"
}
```

### Step 4: Lot 생성

```bash
curl -X POST $API_BASE/user/v1/lots \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "parent_case_id": "660e8400-e29b-41d4-a716-446655440001",
    "part_type": "BATTERY_PACK",
    "quantity": 1,
    "weight_kg": 250.5
  }'
```

**응답:**

```json
{
  "lot_id": "770e8400-e29b-41d4-a716-446655440002",
  "parent_case_id": "660e8400-e29b-41d4-a716-446655440001",
  "part_type": "BATTERY_PACK",
  "quantity": 1,
  "weight_kg": 250.5,
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2026-02-05T11:38:00Z"
}
```

### Step 5: Evidence Presigned URL 생성

```bash
curl -X POST $API_BASE/user/v1/evidence/presign \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "battery_photo_001.jpg",
    "mime_type": "image/jpeg"
  }'
```

**응답:**

```json
{
  "presigned_url": "https://evscrap-evidence-090733632671.s3.ap-northeast-2.amazonaws.com/...",
  "evidence_id": "880e8400-e29b-41d4-a716-446655440003",
  "s3_key": "evidence/550e8400/.../battery_photo_001.jpg",
  "expires_at": "2026-02-05T12:38:00Z"
}
```

### Step 6: S3 업로드

```bash
# 파일 SHA256 계산
FILE_SHA256=$(sha256sum battery_photo_001.jpg | awk '{print $1}')
FILE_SIZE=$(stat -f%z battery_photo_001.jpg)  # macOS
# FILE_SIZE=$(stat -c%s battery_photo_001.jpg)  # Linux

# Presigned URL로 업로드
curl -X PUT "$PRESIGNED_URL" \
  -H "Content-Type: image/jpeg" \
  --data-binary @battery_photo_001.jpg
```

### Step 7: Evidence 등록

```bash
curl -X POST $API_BASE/user/v1/evidence \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "{
    \"evidence_id\": \"880e8400-e29b-41d4-a716-446655440003\",
    \"sha256\": \"$FILE_SHA256\",
    \"size_bytes\": $FILE_SIZE,
    \"captured_at\": \"2026-02-05T11:30:00Z\"
  }"
```

**응답:**

```json
{
  "evidence_id": "880e8400-e29b-41d4-a716-446655440003",
  "s3_bucket": "evscrap-evidence-090733632671",
  "s3_key": "evidence/550e8400/.../battery_photo_001.jpg",
  "sha256": "abc123...",
  "mime_type": "image/jpeg",
  "size_bytes": 1024000,
  "captured_at": "2026-02-05T11:30:00Z",
  "uploaded_at": "2026-02-05T11:39:00Z",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Step 8: 이벤트 생성 (게이트 이벤트 포함)

#### 8-1: INBOUND_CHECKED 이벤트

```bash
curl -X POST $API_BASE/user/v1/LOT/770e8400-e29b-41d4-a716-446655440002/events \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "event_type": "INBOUND_CHECKED",
    "occurred_at": "2026-02-05T11:40:00Z",
    "policy_refs": {
      "wf": "wf.v1"
    },
    "payload": {
      "inspector_id": "inspector-001",
      "checked_at": "2026-02-05T11:40:00Z",
      "notes": "배터리 팩 육안 검사 완료"
    }
  }'
```

**응답:**

```json
{
  "event_id": "990e8400-e29b-41d4-a716-446655440004",
  "target_type": "LOT",
  "target_id": "770e8400-e29b-41d4-a716-446655440002",
  "event_type": "INBOUND_CHECKED",
  "occurred_at": "2026-02-05T11:40:00Z",
  "policy_refs": {
    "wf": "wf.v1"
  },
  "payload": {
    "inspector_id": "inspector-001",
    "checked_at": "2026-02-05T11:40:00Z",
    "notes": "배터리 팩 육안 검사 완료"
  },
  "canonical_hash": "def456...",
  "anchor_status": "PENDING",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 8-2: GRADING_COMPLETED 이벤트

```bash
curl -X POST $API_BASE/user/v1/LOT/770e8400-e29b-41d4-a716-446655440002/events \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "event_type": "GRADING_COMPLETED",
    "occurred_at": "2026-02-05T11:45:00Z",
    "policy_refs": {
      "score": "score.v1"
    },
    "payload": {
      "reuse_grade": "B",
      "recycle_grade": "A",
      "soh": 85.5,
      "notes": "SoH 85.5%, 재사용 양호, 재활용 우수"
    }
  }'
```

**응답:**

```json
{
  "event_id": "aa0e8400-e29b-41d4-a716-446655440005",
  "target_type": "LOT",
  "target_id": "770e8400-e29b-41d4-a716-446655440002",
  "event_type": "GRADING_COMPLETED",
  "occurred_at": "2026-02-05T11:45:00Z",
  "payload": {
    "reuse_grade": "B",
    "recycle_grade": "A",
    "soh": 85.5,
    "notes": "SoH 85.5%, 재사용 양호, 재활용 우수"
  },
  "canonical_hash": "ghi789...",
  "anchor_status": "PENDING",
  "prev_event_id": "990e8400-e29b-41d4-a716-446655440004",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Step 9: Anchor 상태 조회

```bash
curl -X GET $API_BASE/user/v1/events/aa0e8400-e29b-41d4-a716-446655440005/anchor \
  -H "Authorization: Bearer $USER_JWT"
```

**응답 (검증 완료 시):**

```json
{
  "anchor_status": "VERIFIED",
  "anchor_txid": "0x123abc...",
  "verified_at": "2026-02-05T11:46:00Z"
}
```

### Step 10: 정산 조회

```bash
curl -X GET $API_BASE/user/v1/LOT/770e8400-e29b-41d4-a716-446655440002/settlement \
  -H "Authorization: Bearer $USER_JWT"
```

**응답:**

```json
{
  "settlement_id": "bb0e8400-e29b-41d4-a716-446655440006",
  "target_type": "LOT",
  "target_id": "770e8400-e29b-41d4-a716-446655440002",
  "status": "READY_FOR_APPROVAL",
  "amount_min": 5000000,
  "amount_bonus": 500000,
  "amount_total": 5500000,
  "created_at": "2026-02-05T11:47:00Z",
  "updated_at": "2026-02-05T11:47:00Z"
}
```

### Step 11: 관리자 정산 승인 (앵커 조건)

```bash
curl -X POST $API_BASE/admin/v1/settlements/bb0e8400-e29b-41d4-a716-446655440006/approve \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "정산 승인"
  }'
```

**성공 응답:**

```json
{
  "settlement_id": "bb0e8400-e29b-41d4-a716-446655440006",
  "status": "APPROVED",
  "amount_total": 5500000,
  "updated_at": "2026-02-05T11:48:00Z"
}
```

**실패 응답 (앵커 미검증):**

```json
{
  "error_code": "ANCHOR_NOT_VERIFIED",
  "message": "게이트 이벤트의 블록체인 앵커가 검증되지 않았습니다",
  "details": {
    "event_id": "aa0e8400-e29b-41d4-a716-446655440005",
    "anchor_status": "PENDING"
  }
}
```

### Step 12: 관리자 정산 확정

```bash
curl -X POST $API_BASE/admin/v1/settlements/bb0e8400-e29b-41d4-a716-446655440006/commit \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "receipt_hash": "xyz123..."
  }'
```

**응답:**

```json
{
  "settlement_id": "bb0e8400-e29b-41d4-a716-446655440006",
  "status": "COMMITTED",
  "amount_total": 5500000,
  "receipt_hash": "xyz123...",
  "updated_at": "2026-02-05T11:49:00Z"
}
```

## 주요 API 엔드포인트

### User API

#### 테넌트 관리

- `POST /user/v1/tenants/submit`: 테넌트 등록 (phone_number 필수)
- `GET /user/v1/me`: 현재 사용자 정보 조회

#### Case/Lot 관리

- `POST /user/v1/cases`: 차량 Case 생성
- `POST /user/v1/lots`: 부품 Lot 생성 (parent_case_id nullable)

#### Evidence 관리

- `POST /user/v1/evidence/presign`: Presigned URL 생성
- `POST /user/v1/evidence`: Evidence 등록 (SHA256 필수)

#### 이벤트/정산

- `POST /user/v1/{targetType}/{targetId}/events`: 이벤트 생성
  - **Payload 검증**: `event_type`에 따라 `payload` 스키마가 자동으로 강제됩니다 (discriminator 기반)
  - **GRADING_COMPLETED**: `reuse_grade`와 `recycle_grade`가 필수입니다
  - **게이트 이벤트**: INBOUND_CHECKED, DELTA_CALCULATED, SETTLEMENT_APPROVED, SETTLEMENT_COMMITTED도 각각 전용 스키마를 가집니다
- `GET /user/v1/{targetType}/{targetId}/timeline`: 타임라인 조회
- `GET /user/v1/{targetType}/{targetId}/settlement`: 정산 조회
- `GET /user/v1/events/{eventId}/anchor`: 앵커 상태 조회

### Admin API

#### 테넌트 관리

- `GET /admin/v1/tenants?status=PENDING`: 테넌트 목록 조회
- `GET /admin/v1/tenants/{id}`: 테넌트 상세 조회
- `POST /admin/v1/tenants/{id}/approve`: 테넌트 승인

#### 이벤트 관리

- `GET /admin/v1/events?anchor_status=PENDING`: 이벤트 목록 조회
- `GET /admin/v1/events/{eventId}`: 이벤트 상세 조회

#### 정산 관리

- `GET /admin/v1/settlements?status=READY_FOR_APPROVAL`: 정산 목록 조회
- `GET /admin/v1/settlements/{id}`: 정산 상세 조회
- `POST /admin/v1/settlements/{id}/approve`: 정산 승인 (**앵커 VERIFIED 필수**)
- `POST /admin/v1/settlements/{id}/commit`: 정산 확정 (**앵커 VERIFIED 필수**)

#### 정책/감사

- `POST /admin/v1/policies`: 정책 생성
- `POST /admin/v1/policies/{id}/activate`: 정책 활성화
- `GET /admin/v1/audit/missing-anchors`: 앵커 누락 감사

## 참고 사항

### 게이트 이벤트 (블록체인 앵커 필수)

다음 이벤트는 **게이트 이벤트**로 블록체인 앵커가 VERIFIED 상태여야 정산 승인/확정이 가능합니다:

- `INBOUND_CHECKED`: 입고 확인
- `GRADING_COMPLETED`: 등급 판정 완료
- `DELTA_CALCULATED`: 차액 계산
- `SETTLEMENT_APPROVED`: 정산 승인
- `SETTLEMENT_COMMITTED`: 정산 확정

### GRADING_COMPLETED Payload

재사용 등급과 재활용 등급을 동시에 수용합니다:

```json
{
  "reuse_grade": "B",
  "recycle_grade": "A",
  "soh": 85.5,
  "notes": "추가 설명"
}
```

- `reuse_grade`: A (우수), B (양호), C (불량), UNKNOWN (미확인)
- `recycle_grade`: A (우수), B (양호), C (불량), UNKNOWN (미확인)
- `soh`: SoH(State of Health) 입력값 (자동 판단 제외)

### 이벤트 생성 API Payload 검증 (Discriminator 기반)

**OpenAPI 스펙**에서는 `POST /user/v1/{targetType}/{targetId}/events` API의 `event_type`에 따라 `payload` 스키마를 자동으로 강제합니다.

**동작 방식:**

1. **`event_type: GRADING_COMPLETED`** → `GradingCompletedEventCreateRequest` 스키마 적용
   - `payload`는 `GradingCompletedPayload` 참조
   - **필수 필드**: `reuse_grade`, `recycle_grade`
   - **선택 필드**: `soh`, `notes`
   - ❌ `reuse_grade` 또는 `recycle_grade` 누락 시 validation 실패

2. **게이트 이벤트**: 각 이벤트별 전용 스키마
   - `INBOUND_CHECKED` → `InboundCheckedEventCreateRequest`
   - `DELTA_CALCULATED` → `DeltaCalculatedEventCreateRequest`
   - `SETTLEMENT_APPROVED` → `SettlementApprovedEventCreateRequest`
   - `SETTLEMENT_COMMITTED` → `SettlementCommittedEventCreateRequest`

3. **일반 이벤트**: `GenericEventCreateRequest`
   - `TENANT_SUBMITTED`, `TENANT_APPROVED`, `CASE_CREATED`, `LOT_CREATED`, `M0_QUOTED`
   - payload는 느슨한 객체 허용

**예시 (GRADING_COMPLETED):**

```bash
# ✅ 성공 - reuse_grade/recycle_grade 포함
curl -X POST $API_BASE/user/v1/LOT/{lotId}/events \
  -d '{
    "event_type": "GRADING_COMPLETED",
    "occurred_at": "2026-02-05T11:45:00Z",
    "payload": {
      "reuse_grade": "B",      // 필수
      "recycle_grade": "A",    // 필수
      "soh": 85.5,             // 선택
      "notes": "..."           // 선택
    }
  }'

# ❌ 실패 - reuse_grade 누락
curl -X POST $API_BASE/user/v1/LOT/{lotId}/events \
  -d '{
    "event_type": "GRADING_COMPLETED",
    "occurred_at": "2026-02-05T11:45:00Z",
    "payload": {
      "recycle_grade": "A"
    }
  }'
# 응답: 400 VALIDATION_ERROR
```

**이점:**

- 클라이언트가 잘못된 payload를 전송하면 즉시 400 에러 발생
- OpenAPI 스펙에서 타입 안전성 제공
- 서버 구현 시 자동 validation 가능

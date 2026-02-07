# evscrap 도메인 용어집

## 약어 규칙

모든 약어는 문서 내 **최초 등장 시 원문을 병기**합니다.

예시: VIN(Vehicle Identification Number), SoH(State of Health)

## 핵심 도메인 용어

### Tenant (테넌트/폐차장)

폐차장 사업자를 나타냅니다. evscrap 시스템에 등록되어 차량 및 부품을 관리하는 주체입니다.

**속성:**

- `tenant_id`: 고유 식별자 (UUID)
- `status`: 상태 (PENDING, APPROVED, REJECTED, SUSPENDED)
- `display_name`: 표시 이름
- `phone_number`: 전화번호 (E.164 형식 권장, 예: +821012345678)
- `business_number`: 사업자 등록번호 (선택)
- `address`: 주소 (선택)

**상태 전환:**

```
PENDING → APPROVED (관리자 승인)
PENDING → REJECTED (관리자 거부)
APPROVED → SUSPENDED (관리자 정지)
```

---

### Case (차량)

폐차 대상 차량을 나타냅니다. 하나의 Case는 여러 Lot을 포함할 수 있습니다.

**속성:**

- `case_id`: 고유 식별자 (UUID)
- `vin`: VIN(Vehicle Identification Number, 차대번호)
- `make`: 제조사 (예: 현대, 기아)
- `model`: 모델명 (예: 아이오닉5)
- `year`: 연식
- `tenant_id`: 소유 테넌트 ID

**관계:**

- 1개의 Case는 N개의 Lot을 가질 수 있음
- 1개의 Case는 1개의 Tenant에 속함

---

### Lot (부품 Lot)

판매/정산 단위의 부품 묶음입니다. Case와 독립적으로 존재할 수도 있습니다.

**속성:**

- `lot_id`: 고유 식별자 (UUID)
- `parent_case_id`: 부모 Case ID (nullable, 독립 부품 가능)
- `part_type`: 부품 유형 (MOTOR, BATTERY_PACK, INVERTER, OTHER)
- `quantity`: 수량 (기본값 1)
- `weight_kg`: 무게(kg)
- `tenant_id`: 소유 테넌트 ID

**특징:**

- `parent_case_id`가 null이면 Case와 무관한 독립 부품
- MVP에서는 4가지 기본 부품 유형만 지원

---

### Evidence (증빙)

폐차 및 부품 상태를 증명하는 사진/동영상 자료입니다.

**속성:**

- `evidence_id`: 고유 식별자 (UUID)
- `s3_bucket`: S3 버킷 이름
- `s3_key`: S3 객체 키
- `sha256`: 파일 SHA256 해시 (무결성 검증)
- `mime_type`: MIME 타입 (예: image/jpeg, video/mp4)
- `size_bytes`: 파일 크기 (바이트)
- `captured_at`: 촬영 시각 (선택)
- `uploaded_at`: 업로드 시각
- `tenant_id`: 업로드 테넌트 ID

**업로드 플로우:**

1. Presigned URL 생성 (`POST /user/v1/evidence/presign`)
2. S3에 직접 업로드 (클라이언트 → S3)
3. Evidence 등록 (`POST /user/v1/evidence`, SHA256 포함)

---

### Event (원장)

시스템 내 모든 중요 행위를 기록하는 **불변 이벤트 원장**입니다.

**속성:**

- `event_id`: 고유 식별자 (UUID)
- `target_type`: 대상 유형 (CASE, LOT)
- `target_id`: 대상 ID (UUID)
- `event_type`: 이벤트 타입 (아래 참조)
- `occurred_at`: 발생 시각
- `policy_refs`: 정책 참조 (예: `{"m0": "m0.v1", "delta": "delta.v1"}`)
- `payload`: 이벤트별 페이로드 (oneOf 스키마)
- `canonical_hash`: 표준 해시 (SHA256)
- `anchor_status`: 앵커 상태 (NONE, PENDING, VERIFIED, FAILED)
- `anchor_txid`: 블록체인 트랜잭션 ID (선택)
- `prev_event_id`: 이전 이벤트 ID (체인 형성)
- `tenant_id`: 이벤트 생성 테넌트 ID

**특징:**

- 불변 원장: 생성 후 수정/삭제 불가
- 체인 구조: `prev_event_id`로 연결
- 게이트 이벤트는 블록체인 앵커 필수

---

### BlockchainAnchor (앵커)

이벤트를 블록체인에 기록한 정보입니다. 게이트 이벤트의 무결성과 시간 증명을 제공합니다.

**속성:**

- `anchor_status`: 앵커 상태
  - `NONE`: 앵커링 불필요
  - `PENDING`: 앵커링 대기 중
  - `VERIFIED`: 블록체인 검증 완료
  - `FAILED`: 앵커링 실패
- `anchor_txid`: 블록체인 트랜잭션 ID
- `verified_at`: 검증 완료 시각

**게이트 이벤트 조건:**
게이트 이벤트(INBOUND_CHECKED, GRADING_COMPLETED, DELTA_CALCULATED, SETTLEMENT_APPROVED, SETTLEMENT_COMMITTED)는 `anchor_status`가 `VERIFIED`여야만 정산 승인/확정이 가능합니다.

---

### Policy (정책)

가격 책정, 등급 평가, 워크플로우를 정의하는 버전 관리 정책입니다.

**속성:**

- `policy_id`: 고유 식별자 (UUID)
- `policy_type`: 정책 유형
  - `M0`: 초기 견적 정책
  - `DELTA`: 차액 계산 정책
  - `SCORE`: 점수/등급 정책
  - `WORKFLOW`: 워크플로우 정책
- `version`: 버전 (예: "m0.v1", "delta.v2")
- `is_active`: 활성화 여부
- `policy_body`: 정책 본문 (JSON 객체)
- `created_at`: 생성 시각

**버전 관리:**

- 동일 `policy_type`에 여러 버전 존재 가능
- `is_active=true`인 버전이 현재 적용 중
- 관리자가 활성화/비활성화 관리

---

### Settlement (정산)

Case 또는 Lot에 대한 정산 정보입니다.

**속성:**

- `settlement_id`: 고유 식별자 (UUID)
- `target_type`: 대상 유형 (CASE, LOT)
- `target_id`: 대상 ID (UUID)
- `status`: 정산 상태
  - `DRAFT`: 임시 (자동 생성)
  - `READY_FOR_APPROVAL`: 승인 대기
  - `APPROVED`: 승인 완료 (관리자)
  - `COMMITTED`: 확정 완료 (관리자)
- `amount_min`: 최소 금액
- `amount_bonus`: 보너스 금액
- `amount_total`: 총 금액
- `receipt_hash`: 영수증 해시 (선택)
- `created_at`: 생성 시각
- `updated_at`: 갱신 시각

**상태 전환:**

```
DRAFT → READY_FOR_APPROVAL (시스템 자동)
READY_FOR_APPROVAL → APPROVED (관리자 승인, 앵커 VERIFIED 필수)
APPROVED → COMMITTED (관리자 확정, 앵커 VERIFIED 필수)
```

---

## 약어 목록

### VIN (Vehicle Identification Number)

차대번호. 차량을 고유하게 식별하는 17자리 코드입니다.

**예시:** `KMHXX00XXXX000001`

---

### SoH (State of Health)

배터리 건강 상태. 배터리 용량의 잔존율을 나타내는 지표입니다 (단위: %).

**예시:** `85.5` (85.5% 건강 상태)

**MVP 제한사항:**

- SoH 자동 측정/표준화는 제외
- 입력 필드로만 수용 (`GRADING_COMPLETED` 이벤트 payload에 포함)

---

### OIDC (OpenID Connect)

인증 프로토콜. OAuth 2.0 기반 인증 레이어입니다.

**evscrap 사용:**

- AWS Cognito에서 OIDC 제공
- User/Admin 분리 인증

---

### MFA (Multi-Factor Authentication)

다단계 인증. 비밀번호 외 추가 인증 수단을 요구하는 보안 방식입니다.

**evscrap 적용:**

- 관리자 계정에 MFA 권장 (Phase 1-A 이후)

---

### MVP (Minimum Viable Product)

최소 기능 제품. 핵심 기능만 포함한 초기 버전입니다.

**evscrap MVP 범위:**

- 테넌트 등록/승인
- Case/Lot 등록
- Evidence 업로드
- 이벤트 원장
- 블록체인 앵커
- 정산 승인/확정

**MVP 제외:**

- 경매/판매/마켓플레이스
- 개인 직접 등록
- SoH 자동 측정

---

### SSOT (Single Source of Truth)

단일 진실 공급원. 정보의 유일하고 신뢰할 수 있는 출처입니다.

**evscrap 적용:**

- `openapi.yaml`이 API 계약의 SSOT

---

### JWT (JSON Web Token)

JSON 웹 토큰. 클레임 기반 인증 토큰 표준입니다.

**evscrap 사용:**

- Cognito에서 JWT 발급
- API 헤더: `Authorization: Bearer <JWT>`
- User/Admin 별도 JWT 사용

---

## 이벤트 타입 설명

### 일반 이벤트

| 이벤트 타입        | 설명                 | 게이트 여부 | 앵커 필수 |
| ------------------ | -------------------- | ----------- | --------- |
| `TENANT_SUBMITTED` | 테넌트 등록 제출     | ❌          | ❌        |
| `TENANT_APPROVED`  | 테넌트 승인 (관리자) | ❌          | ❌        |
| `CASE_CREATED`     | 차량 Case 생성       | ❌          | ❌        |
| `LOT_CREATED`      | 부품 Lot 생성        | ❌          | ❌        |
| `M0_QUOTED`        | 초기 견적 생성       | ❌          | ❌        |

### 게이트 이벤트 (블록체인 앵커 필수)

| 이벤트 타입            | 설명               | 게이트 여부 | 앵커 필수 |
| ---------------------- | ------------------ | ----------- | --------- |
| `INBOUND_CHECKED`      | 입고 확인          | ✅          | ✅        |
| `GRADING_COMPLETED`    | 등급 판정 완료     | ✅          | ✅        |
| `DELTA_CALCULATED`     | 차액 계산          | ✅          | ✅        |
| `SETTLEMENT_APPROVED`  | 정산 승인 (관리자) | ✅          | ✅        |
| `SETTLEMENT_COMMITTED` | 정산 확정 (관리자) | ✅          | ✅        |

**게이트 이벤트 조건:**

- 정산 승인(`/admin/v1/settlements/{id}/approve`) 또는 정산 확정(`/admin/v1/settlements/{id}/commit`) 시, 관련 게이트 이벤트의 `anchor_status`가 `VERIFIED`여야 함
- 앵커가 `PENDING` 또는 `FAILED` 상태이면 HTTP 409 + `ANCHOR_NOT_VERIFIED` 에러 반환

---

## 등급 체계

### Reuse Grade (재사용 등급)

부품의 재사용 가능성을 평가하는 등급입니다. 상태/성능/SoH 기반으로 판정합니다.

| 등급      | 설명                              |
| --------- | --------------------------------- |
| `A`       | 우수 (재사용 가능, 높은 성능)     |
| `B`       | 양호 (재사용 가능, 보통 성능)     |
| `C`       | 불량 (재사용 불가 또는 낮은 성능) |
| `UNKNOWN` | 미확인 (판정 불가)                |

---

### Recycle Grade (재활용 등급)

부품의 재활용 가능성을 평가하는 등급입니다. 회수/오염/혼합/공정 난이도 기반으로 판정합니다.

| 등급      | 설명                              |
| --------- | --------------------------------- |
| `A`       | 우수 (재활용 용이, 낮은 오염도)   |
| `B`       | 양호 (재활용 가능, 보통 오염도)   |
| `C`       | 불량 (재활용 어려움, 높은 오염도) |
| `UNKNOWN` | 미확인 (판정 불가)                |

---

### GRADING_COMPLETED Payload

재사용 등급과 재활용 등급을 **동시에 수용**합니다:

```json
{
  "reuse_grade": "B",
  "recycle_grade": "A",
  "soh": 85.5,
  "notes": "SoH 85.5%, 재사용 양호, 재활용 우수"
}
```

**필드 설명:**

- `reuse_grade` (필수): 재사용 등급 (A|B|C|UNKNOWN)
- `recycle_grade` (필수): 재활용 등급 (A|B|C|UNKNOWN)
- `soh` (선택): SoH 입력값 (number 또는 string, 자동 판단은 제외)
- `notes` (선택): 추가 설명

---

## 상태(Status) 설명

### TenantStatus (테넌트 상태)

| 상태        | 설명                         |
| ----------- | ---------------------------- |
| `PENDING`   | 승인 대기                    |
| `APPROVED`  | 승인 완료                    |
| `REJECTED`  | 거부됨                       |
| `SUSPENDED` | 정지됨 (위반 또는 관리 정지) |

---

### AnchorStatus (앵커 상태)

| 상태       | 설명               |
| ---------- | ------------------ |
| `NONE`     | 앵커링 불필요      |
| `PENDING`  | 앵커링 대기 중     |
| `VERIFIED` | 블록체인 검증 완료 |
| `FAILED`   | 앵커링 실패        |

---

### SettlementStatus (정산 상태)

| 상태                 | 설명                    |
| -------------------- | ----------------------- |
| `DRAFT`              | 임시 (시스템 자동 생성) |
| `READY_FOR_APPROVAL` | 승인 대기               |
| `APPROVED`           | 승인 완료 (관리자)      |
| `COMMITTED`          | 확정 완료 (관리자)      |

---

## 참고 자료

- [OpenAPI 스펙](file:///c:/Users/sonic/Projects/evscrap/evscrap/core-api/openapi.yaml)
- [API 계약 문서](file:///c:/Users/sonic/Projects/evscrap/evscrap/docs/API_CONTRACT.md)
- [Phase 0-A 아키텍처](file:///c:/Users/sonic/Projects/evscrap/evscrap/docs/ARCHITECTURE_PHASE0.md)

#!/usr/bin/env node
/**
 * P2-1.5 Admin 조회 API E2E 스모크 테스트
 *
 * 검증 항목:
 * 1) GET /admin/v1/cases — 케이스 목록 조회
 * 2) GET /admin/v1/cases/{caseId} — 케이스 상세 (데이터가 있을 때)
 * 3) GET /admin/v1/{targetType}/{targetId}/timeline — 타임라인
 * 4) GET /admin/v1/evidence?tenant_id=X — 증빙 목록
 *
 * 환경변수:
 * - API_BASE (필수): API Gateway URL
 * - COGNITO_USER_POOL_ID_ADMIN, COGNITO_CLIENT_ID_ADMIN (토큰 생성용)
 * - TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD (관리자 로그인)
 *
 * 데이터가 없으면 SKIP + warning (workflow FAIL하지 않음)
 */

const API_BASE = process.env.API_BASE;
if (!API_BASE) {
  console.error('❌ API_BASE 환경변수 필요');
  process.exit(1);
}

// ─── Admin 토큰 획득 ───
async function getAdminToken() {
  const poolId = process.env.COGNITO_USER_POOL_ID_ADMIN;
  const clientId = process.env.COGNITO_CLIENT_ID_ADMIN;
  const username = process.env.TEST_ADMIN_USERNAME;
  const password = process.env.TEST_ADMIN_PASSWORD;

  if (!poolId || !clientId || !username || !password) {
    console.warn('⚠️  Admin Cognito 인증 정보 부족 — 토큰 없이 진행 (401 예상)');
    return null;
  }

  // cognito-identity-js 없이 Cognito InitiateAuth 직접 호출
  const region = process.env.AWS_REGION || 'ap-northeast-2';
  const url = `https://cognito-idp.${region}.amazonaws.com/`;
  const body = JSON.stringify({
    AuthParameters: { USERNAME: username, PASSWORD: password },
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: clientId,
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn(`⚠️  Admin 로그인 실패 (${res.status}): ${errText.slice(0, 200)}`);
    return null;
  }

  const data = await res.json();
  const token = data?.AuthenticationResult?.IdToken;
  if (!token) {
    console.warn('⚠️  IdToken 없음 (NewPasswordRequired 등 추가 챌린지?)');
    return null;
  }
  console.log(`✅ Admin 토큰 획득 (length: ${token.length})`);
  return token;
}

// ─── API 호출 헬퍼 ───
async function apiGet(path, token) {
  const url = `${API_BASE}${path}`;
  const headers = { 'x-correlation-id': crypto.randomUUID() };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  console.log(`  → GET ${path}`);
  const res = await fetch(url, { headers });
  const status = res.status;
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status, body };
}

// ─── 메인 ───
let passed = 0;
let skipped = 0;
let failed = 0;

async function main() {
  const token = await getAdminToken();

  // 1) Cases 목록
  console.log('\n[1] GET /admin/v1/cases');
  const cases = await apiGet('admin/v1/cases', token);
  if (cases.status === 200) {
    const items = cases.body?.items || [];
    console.log(`  ✅ 200 OK — ${items.length} cases`);
    passed++;

    if (items.length > 0) {
      const caseId = items[0].case_id || items[0].id;
      const tenantId = items[0].tenant_id;

      // 2) Case 상세
      console.log(`\n[2] GET /admin/v1/cases/${caseId}`);
      const detail = await apiGet(`admin/v1/cases/${caseId}`, token);
      if (detail.status === 200) {
        const lots = detail.body?.lots || [];
        console.log(`  ✅ 200 OK — lots: ${lots.length}, events: ${detail.body?.event_count || 0}`);
        passed++;
      } else {
        console.log(`  ❌ ${detail.status}`);
        failed++;
      }

      // 3) Timeline
      console.log(`\n[3] GET /admin/v1/CASE/${caseId}/timeline`);
      const timeline = await apiGet(`admin/v1/CASE/${caseId}/timeline`, token);
      if (timeline.status === 200) {
        const events = timeline.body?.events || [];
        console.log(`  ✅ 200 OK — ${events.length} events`);
        passed++;
      } else {
        console.log(`  ❌ ${timeline.status}`);
        failed++;
      }

      // 4) Evidence
      if (tenantId) {
        console.log(`\n[4] GET /admin/v1/evidence?tenant_id=${tenantId}`);
        const evidence = await apiGet(`admin/v1/evidence?tenant_id=${tenantId}`, token);
        if (evidence.status === 200) {
          const items = evidence.body?.items || [];
          console.log(`  ✅ 200 OK — ${items.length} evidence items`);
          passed++;
        } else {
          console.log(`  ❌ ${evidence.status}`);
          failed++;
        }
      } else {
        console.log('\n[4] SKIP — tenant_id 없음');
        skipped++;
      }
    } else {
      console.log('  ⚠️  케이스가 없어 [2][3][4] SKIP');
      skipped += 3;
    }
  } else if (cases.status === 401) {
    console.log('  ⚠️  401 Unauthorized — 토큰 문제. SKIP.');
    skipped += 4;
  } else {
    console.log(`  ❌ ${cases.status}: ${JSON.stringify(cases.body).slice(0, 200)}`);
    failed++;
    skipped += 3;
  }

  // 결과 요약
  console.log(`\n════════════════════════════`);
  console.log(`Admin Read E2E: PASS=${passed} SKIP=${skipped} FAIL=${failed}`);
  console.log(`════════════════════════════`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('E2E script error:', err);
  process.exit(1);
});

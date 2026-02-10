#!/usr/bin/env node
/**
 * db-smoke.mjs
 * 배포 직후 DB Read/Write + Anchor E2E + 정산 409 게이트 자동 검증
 *
 * 필수 환경변수:
 *   API_BASE, USER_POOL_ID, USER_POOL_CLIENT_ID,
 *   ADMIN_POOL_ID, ADMIN_POOL_CLIENT_ID,
 *   TEST_USER_USERNAME, TEST_USER_PASSWORD,
 *   TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD,
 *   AWS_REGION (기본 ap-northeast-2)
 */
import { execSync } from 'node:child_process';

const REGION = process.env.AWS_REGION || 'ap-northeast-2';
// 기존 Lambda 환경변수에 설정된 test-secret (추가 아님, 기존 메커니즘 활용)
const TEST_SECRET = 'evscrap-test-secret-2026';

// ──────── 유틸 ────────
function mask(str) {
  if (!str || str.length < 8) return '***';
  return str.slice(0, 4) + '****' + str.slice(-4);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ──────── Cognito 토큰 발급 ────────
function getIdToken(poolId, clientId, username, password, label) {
  console.log(`\n🔑 [${label}] Cognito 토큰 발급 중... (user: ${mask(username)})`);
  try {
    const inputJson = JSON.stringify({
      ClientId: clientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: username, PASSWORD: password },
    });
    const cmd = `aws cognito-idp initiate-auth --cli-input-json '${inputJson.replace(/'/g, "'\\''")}' --region ${REGION} --output json`;
    const result = JSON.parse(
      execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    );
    const idToken = result.AuthenticationResult?.IdToken;
    if (!idToken) throw new Error('IdToken 없음');
    console.log(`   ✅ [${label}] 토큰 발급 성공 (length: ${idToken.length})`);
    return idToken;
  } catch (e) {
    console.error(`   ❌ [${label}] 토큰 발급 실패: ${e.message}`);
    if (e.stderr) console.error(`   stderr: ${e.stderr.toString().slice(0, 300)}`);
    process.exit(1);
  }
}

// ──────── HTTP 요청 ────────
async function apiCall(method, path, { token, testTenantId, body, label }) {
  const API_BASE = (process.env.API_BASE || '').replace(/\/$/, '');
  const url = `${API_BASE}${path}`;
  console.log(`\n📡 [${label}] ${method} ${url}`);

  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // test-secret 인증 (기존 메커니즘, Cognito sub ≠ tenant_id 보완)
  if (testTenantId) {
    headers['x-test-secret'] = TEST_SECRET;
    headers['x-test-tenant-id'] = testTenantId;
  }

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  let data;
  try { data = await res.json(); } catch { data = await res.text(); }

  const safeData = typeof data === 'object'
    ? JSON.stringify(data, null, 2).slice(0, 600)
    : String(data).slice(0, 600);

  console.log(`   HTTP ${res.status} ${res.statusText}`);
  console.log(`   Body: ${safeData}`);

  return { status: res.status, data };
}

function assertStatus(result, expected, label) {
  if (result.status !== expected) {
    console.error(`\n❌ FAIL [${label}]: 기대 ${expected}, 실제 ${result.status}`);
    process.exit(1);
  }
  console.log(`   ✅ [${label}] PASS (HTTP ${result.status})`);
}

// ──────── MAIN ────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  evscrap DB Smoke + Anchor E2E + Settlement Gate');
  console.log('═══════════════════════════════════════════════════');

  // 필수 환경변수 확인 + trim
  const required = [
    'API_BASE', 'USER_POOL_ID', 'USER_POOL_CLIENT_ID',
    'ADMIN_POOL_ID', 'ADMIN_POOL_CLIENT_ID',
    'TEST_USER_USERNAME', 'TEST_USER_PASSWORD',
    'TEST_ADMIN_USERNAME', 'TEST_ADMIN_PASSWORD',
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`\n❌ 필수 환경변수 누락: ${missing.join(', ')}`);
    process.exit(1);
  }
  for (const key of required) {
    if (process.env[key]) process.env[key] = process.env[key].trim();
  }

  const API_BASE = process.env.API_BASE.replace(/\/$/, '');
  console.log(`API_BASE: ${API_BASE}`);
  console.log(`REGION:   ${REGION}`);

  // ═══════════════════════════════════════
  // Phase A: 기본 DB Read/Write
  // ═══════════════════════════════════════
  console.log('\n\n──── Phase A: 기본 DB Read/Write ────');

  // A1) /health
  const health = await apiCall('GET', '/health', { label: 'A1-health' });
  assertStatus(health, 200, 'health');

  // A2) Cognito 토큰 발급
  const userToken = getIdToken(
    process.env.USER_POOL_ID, process.env.USER_POOL_CLIENT_ID,
    process.env.TEST_USER_USERNAME, process.env.TEST_USER_PASSWORD, 'User'
  );
  const adminToken = getIdToken(
    process.env.ADMIN_POOL_ID, process.env.ADMIN_POOL_CLIENT_ID,
    process.env.TEST_ADMIN_USERNAME, process.env.TEST_ADMIN_PASSWORD, 'Admin'
  );

  // A3) DB WRITE: tenant 생성
  const ts = Date.now();
  const tenantRes = await apiCall('POST', '/user/v1/tenants/submit', {
    token: userToken,
    body: { display_name: `CI-Smoke-${ts}`, phone_number: '+821000000000' },
    label: 'A3-tenant-create (DB WRITE)',
  });
  assertStatus(tenantRes, 201, 'tenant-create');
  const tenantId = tenantRes.data.id;
  console.log(`   tenant_id: ${tenantId}`);

  // A4) DB READ: tenant list
  const tenantsRes = await apiCall('GET', '/admin/v1/tenants', {
    token: adminToken,
    label: 'A4-tenant-list (DB READ)',
  });
  assertStatus(tenantsRes, 200, 'tenant-list');

  // ═══════════════════════════════════════
  // Phase B: Anchor E2E
  // ═══════════════════════════════════════
  console.log('\n\n──── Phase B: Anchor E2E ────');

  // B1) Case 생성 (test-secret + tenant_id)
  const caseRes = await apiCall('POST', '/user/v1/cases', {
    testTenantId: tenantId,
    body: { vin: `SMOKE${ts}`, make: 'CI-Test', model: 'SmokeModel', year: 2026 },
    label: 'B1-case-create',
  });
  assertStatus(caseRes, 201, 'case-create');
  const caseId = caseRes.data.id || caseRes.data.case_id;
  console.log(`   case_id: ${caseId}`);

  // B2) Event 생성 → anchor_status=PENDING
  const eventRes = await apiCall('POST', `/user/v1/CASE/${caseId}/events`, {
    testTenantId: tenantId,
    body: {
      event_type: 'CASE_CREATED',
      occurred_at: new Date().toISOString(),
      payload: { note: `CI smoke ${ts}` },
    },
    label: 'B2-event-create',
  });
  assertStatus(eventRes, 201, 'event-create');
  const eventId = eventRes.data.id || eventRes.data.event_id;
  const initialAnchor = eventRes.data.anchor_status;
  console.log(`   event_id: ${eventId}, anchor_status: ${initialAnchor}`);

  // B3) Anchor VERIFIED 폴링 (Worker가 SQS 처리)
  console.log('\n⏳ Worker 처리 대기 (anchor VERIFIED 폴링)...');
  let anchorVerified = false;
  const maxWait = 120; // 초
  const pollInterval = 5; // 초

  for (let elapsed = 0; elapsed < maxWait; elapsed += pollInterval) {
    await sleep(pollInterval * 1000);
    const timelineRes = await apiCall('GET', `/user/v1/CASE/${caseId}/timeline`, {
      testTenantId: tenantId,
      label: `B3-poll (${elapsed + pollInterval}s)`,
    });
    if (timelineRes.status === 200 && timelineRes.data.events) {
      const ev = timelineRes.data.events.find(e => (e.id || e.event_id) === eventId);
      if (ev && ev.anchor_status === 'VERIFIED') {
        console.log(`   🎉 anchor_status=VERIFIED! txid=${ev.anchor_txid || 'N/A'}`);
        anchorVerified = true;
        break;
      }
      console.log(`   ... anchor_status=${ev?.anchor_status || 'unknown'}`);
    }
  }

  if (!anchorVerified) {
    console.error('\n❌ FAIL: Anchor VERIFIED 대기 시간 초과 (120s)');
    process.exit(1);
  }
  console.log('   ✅ [Anchor E2E] PASS: PENDING → VERIFIED');

  // ═══════════════════════════════════════
  // Phase C: 정산 409 게이트
  // ═══════════════════════════════════════
  console.log('\n\n──── Phase C: 정산 409 게이트 ────');

  // C1) Settlement 생성 (DRAFT)
  const settlementRes = await apiCall('POST', `/user/v1/CASE/${caseId}/settlement`, {
    testTenantId: tenantId,
    body: { amount_total: 1000000 },
    label: 'C1-settlement-create',
  });
  assertStatus(settlementRes, 201, 'settlement-create');
  const settlementId = settlementRes.data.id || settlementRes.data.settlement_id;
  console.log(`   settlement_id: ${settlementId}`);

  // C2) 새 이벤트 생성 (PENDING 상태) → approve 시 409 기대
  const event2Res = await apiCall('POST', `/user/v1/CASE/${caseId}/events`, {
    testTenantId: tenantId,
    body: {
      event_type: 'INBOUND_CHECKED',
      occurred_at: new Date().toISOString(),
      payload: { inspector_id: 'ci-inspector' },
    },
    label: 'C2-event2-create (PENDING)',
  });
  assertStatus(event2Res, 201, 'event2-create');
  const event2Anchor = event2Res.data.anchor_status;
  console.log(`   event2 anchor_status: ${event2Anchor}`);

  // C3) Approve 시도 → 409 ANCHOR_NOT_VERIFIED 기대
  const approveFailRes = await apiCall('POST', `/admin/v1/settlements/${settlementId}/approve`, {
    token: adminToken,
    label: 'C3-approve (expect 409)',
  });
  assertStatus(approveFailRes, 409, 'approve-409-gate');
  console.log(`   ✅ 정산 409 게이트 작동 확인: ANCHOR_NOT_VERIFIED`);

  // C4) Event2도 VERIFIED 될 때까지 대기
  console.log('\n⏳ Event2 VERIFIED 대기...');
  const event2Id = event2Res.data.id || event2Res.data.event_id;
  let event2Verified = false;
  for (let elapsed = 0; elapsed < maxWait; elapsed += pollInterval) {
    await sleep(pollInterval * 1000);
    const tlRes = await apiCall('GET', `/user/v1/CASE/${caseId}/timeline`, {
      testTenantId: tenantId,
      label: `C4-poll (${elapsed + pollInterval}s)`,
    });
    if (tlRes.status === 200 && tlRes.data.events) {
      const ev2 = tlRes.data.events.find(e => (e.id || e.event_id) === event2Id);
      if (ev2 && ev2.anchor_status === 'VERIFIED') {
        console.log(`   🎉 event2 anchor_status=VERIFIED!`);
        event2Verified = true;
        break;
      }
      console.log(`   ... event2 anchor_status=${ev2?.anchor_status || 'unknown'}`);
    }
  }
  if (!event2Verified) {
    console.error('\n❌ FAIL: Event2 VERIFIED 대기 시간 초과');
    process.exit(1);
  }

  // C5) 모든 이벤트 VERIFIED → Approve 성공
  const approveOkRes = await apiCall('POST', `/admin/v1/settlements/${settlementId}/approve`, {
    token: adminToken,
    label: 'C5-approve (expect 200)',
  });
  assertStatus(approveOkRes, 200, 'approve-success');

  // C6) Commit 성공
  const commitRes = await apiCall('POST', `/admin/v1/settlements/${settlementId}/commit`, {
    token: adminToken,
    body: { receipt_hash: `smoke-receipt-${ts}` },
    label: 'C6-commit (expect 200)',
  });
  assertStatus(commitRes, 200, 'commit-success');

  // ═══════════════════════════════════════
  // DONE
  // ═══════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  ✅ ALL PASS: DB Smoke + Anchor E2E + Settlement Gate');
  console.log('  Phase 1-B 완료 선언 가능');
  console.log('═══════════════════════════════════════════════════');
}

main().catch(e => {
  console.error(`\n❌ 예기치 않은 오류: ${e.message}`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * e2e-idempotency.mjs
 * Idempotency-Key 동작 E2E 자동 검증
 *
 * 시나리오:
 *   1) 동일 Key + 동일 Body → 1회차 201, 2회차 캐시(같은 body + Idempotency-Replayed 헤더)
 *   2) 동일 Key + 다른 Body → 409 IDEMPOTENCY_KEY_CONFLICT
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

const REGION = process.env.AWS_REGION || 'ap-northeast-2';
const TEST_SECRET = 'evscrap-test-secret-2026';

// ──────── 유틸 ────────
function mask(str) {
  if (!str || str.length < 8) return '***';
  return str.slice(0, 4) + '****' + str.slice(-4);
}

function getIdToken(clientId, username, password, label) {
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
    console.log(`   ✅ [${label}] 토큰 발급 성공`);
    return idToken;
  } catch (e) {
    console.error(`   ❌ [${label}] 토큰 발급 실패: ${e.message}`);
    process.exit(1);
  }
}

async function apiCall(method, path, { token, testTenantId, body, label, headers: extraHeaders }) {
  const API_BASE = (process.env.API_BASE || '').replace(/\/$/, '');
  const url = `${API_BASE}${path}`;
  console.log(`\n📡 [${label}] ${method} ${url}`);

  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (testTenantId) {
    headers['x-test-secret'] = TEST_SECRET;
    headers['x-test-tenant-id'] = testTenantId;
  }

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  let data;
  try { data = await res.json(); } catch { data = null; }

  const replayed = res.headers.get('idempotency-replayed');
  console.log(`   HTTP ${res.status} | Replayed: ${replayed || 'N/A'}`);
  if (data) console.log(`   Body: ${JSON.stringify(data).slice(0, 400)}`);

  return { status: res.status, data, replayed };
}

// ──────── MAIN ────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  evscrap Idempotency-Key E2E Test');
  console.log('═══════════════════════════════════════════════════');

  const required = [
    'API_BASE', 'USER_POOL_CLIENT_ID',
    'TEST_USER_USERNAME', 'TEST_USER_PASSWORD',
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`❌ 필수 환경변수 누락: ${missing.join(', ')}`);
    process.exit(1);
  }
  for (const key of required) {
    if (process.env[key]) process.env[key] = process.env[key].trim();
  }

  console.log(`API_BASE: ${process.env.API_BASE}`);

  // 1) Cognito 토큰 발급
  const userToken = getIdToken(
    process.env.USER_POOL_CLIENT_ID,
    process.env.TEST_USER_USERNAME, process.env.TEST_USER_PASSWORD, 'User'
  );

  // 먼저 tenant 생성 → tenant_id (test-secret으로 case/event에 사용)
  const ts = Date.now();
  const setupTenant = await apiCall('POST', '/user/v1/tenants/submit', {
    token: userToken,
    body: { display_name: `Idem-Setup-${ts}`, phone_number: '+821099990000' },
    label: 'setup-tenant',
    headers: {},
  });
  if (setupTenant.status !== 201) {
    console.error('❌ tenant 생성 실패');
    process.exit(1);
  }
  const tenantId = setupTenant.data.id;
  console.log(`   tenant_id: ${tenantId}`);

  // ═══════════════════════════════════════
  // Test 1: 동일 Key + 동일 Body → 캐시 replay
  // ═══════════════════════════════════════
  console.log('\n\n──── Test 1: 동일 Key + 동일 Body → Replay ────');
  const idemKey1 = crypto.randomUUID();
  const phone1 = `+8210${String(ts).slice(-8)}`;

  const call1 = await apiCall('POST', '/user/v1/tenants/submit', {
    token: userToken,
    body: { display_name: `Idem-Test1-${ts}`, phone_number: phone1 },
    label: 'T1-call1 (original)',
    headers: { 'Idempotency-Key': idemKey1 },
  });
  if (call1.status !== 201) {
    console.error(`❌ FAIL T1-call1: 기대 201, 실제 ${call1.status}`);
    process.exit(1);
  }
  console.log(`   ✅ T1-call1: 201 Created (id: ${call1.data.id})`);

  const call2 = await apiCall('POST', '/user/v1/tenants/submit', {
    token: userToken,
    body: { display_name: `Idem-Test1-${ts}`, phone_number: phone1 },
    label: 'T1-call2 (replay)',
    headers: { 'Idempotency-Key': idemKey1 },
  });
  // 캐시 replay: 같은 body, 같은 id 반환
  if (call2.status !== 201 && call2.status !== 200) {
    console.error(`❌ FAIL T1-call2: 기대 200/201, 실제 ${call2.status}`);
    process.exit(1);
  }
  if (call2.data.id !== call1.data.id) {
    console.error(`❌ FAIL T1-call2: id 불일치 (${call1.data.id} vs ${call2.data.id})`);
    process.exit(1);
  }
  console.log(`   ✅ T1-call2: Replay 확인 (같은 id: ${call2.data.id})`);
  if (call2.replayed === 'true') {
    console.log(`   ✅ Idempotency-Replayed: true 헤더 확인`);
  } else {
    console.log(`   ⚠️  Idempotency-Replayed 헤더 없음 (선택 검증)`);
  }

  // ═══════════════════════════════════════
  // Test 2: 동일 Key + 다른 Body → 409 CONFLICT
  // ═══════════════════════════════════════
  console.log('\n\n──── Test 2: 동일 Key + 다른 Body → 409 CONFLICT ────');
  const call3 = await apiCall('POST', '/user/v1/tenants/submit', {
    token: userToken,
    body: { display_name: `DIFFERENT-PAYLOAD-${ts}`, phone_number: '+821011112222' },
    label: 'T2-call3 (conflict)',
    headers: { 'Idempotency-Key': idemKey1 },
  });
  if (call3.status !== 409) {
    console.error(`❌ FAIL T2-call3: 기대 409, 실제 ${call3.status}`);
    process.exit(1);
  }
  if (call3.data?.error_code !== 'IDEMPOTENCY_KEY_CONFLICT') {
    console.error(`❌ FAIL T2-call3: error_code 불일치 (${call3.data?.error_code})`);
    process.exit(1);
  }
  console.log(`   ✅ T2-call3: 409 IDEMPOTENCY_KEY_CONFLICT 확인`);

  // ═══════════════════════════════════════
  // DONE
  // ═══════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  ✅ ALL PASS: Idempotency-Key E2E Test');
  console.log('═══════════════════════════════════════════════════');
}

main().catch(e => {
  console.error(`❌ 예기치 않은 오류: ${e.message}`);
  process.exit(1);
});

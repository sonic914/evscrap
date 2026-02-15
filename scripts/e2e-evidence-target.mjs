#!/usr/bin/env node
/**
 * e2e-evidence-target.mjs
 * P2-3.1: Evidence target 연결 + list E2E 테스트
 *
 * 필수 환경변수: API_BASE, USER_POOL_ID, USER_POOL_CLIENT_ID,
 *   TEST_USER_USERNAME, TEST_USER_PASSWORD, AWS_REGION
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const REGION = process.env.AWS_REGION || 'ap-northeast-2';
const TEST_SECRET = 'evscrap-test-secret-2026';

function getIdToken(poolId, clientId, username, password) {
  const inputJson = JSON.stringify({
    ClientId: clientId,
    AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: username, PASSWORD: password },
  });
  const cmd = `aws cognito-idp initiate-auth --cli-input-json '${inputJson.replace(/'/g, "'\\''")}' --region ${REGION} --output json`;
  const result = JSON.parse(execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }));
  return result.AuthenticationResult?.IdToken;
}

async function api(method, path, { token, testTenantId, body, label }) {
  const API_BASE = (process.env.API_BASE || '').replace(/\/$/, '');
  const url = `${API_BASE}${path}`;
  console.log(`\n📡 [${label}] ${method} ${url}`);

  const headers = { 'Content-Type': 'application/json' };
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
  console.log(`   HTTP ${res.status}`);
  if (data) console.log(`   Body: ${JSON.stringify(data, null, 2).slice(0, 500)}`);
  return { status: res.status, data };
}

function assert(result, expected, label) {
  if (result.status !== expected) {
    console.error(`\n❌ FAIL [${label}]: 기대 ${expected}, 실제 ${result.status}`);
    process.exit(1);
  }
  console.log(`   ✅ [${label}] PASS (HTTP ${result.status})`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  P2-3.1: Evidence Target + List E2E');
  console.log('═══════════════════════════════════════════════════');

  const required = ['API_BASE', 'USER_POOL_ID', 'USER_POOL_CLIENT_ID', 'TEST_USER_USERNAME', 'TEST_USER_PASSWORD'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`❌ 필수 환경변수 누락: ${missing.join(', ')}`);
    process.exit(1);
  }

  const userToken = getIdToken(
    process.env.USER_POOL_ID, process.env.USER_POOL_CLIENT_ID,
    process.env.TEST_USER_USERNAME, process.env.TEST_USER_PASSWORD
  );

  const ts = Date.now();

  // 1) Tenant 생성
  const tenantRes = await api('POST', '/user/v1/tenants/submit', {
    token: userToken,
    body: { display_name: `EvidTarget-${ts}`, phone_number: '+821099990000' },
    label: '1-tenant',
  });
  assert(tenantRes, 201, 'tenant-create');
  const tenantId = tenantRes.data.id;

  // 2) Case 생성
  const caseRes = await api('POST', '/user/v1/cases', {
    testTenantId: tenantId,
    body: { vin: `EVID${ts}`, make: 'Test', model: 'Target', year: 2026 },
    label: '2-case',
  });
  assert(caseRes, 201, 'case-create');
  const caseId = caseRes.data.id || caseRes.data.case_id;

  // 3) Evidence presign (with target)
  const presignRes = await api('POST', '/user/v1/evidence/presign', {
    testTenantId: tenantId,
    body: {
      filename: 'test-photo.jpg',
      mime_type: 'image/jpeg',
      target_type: 'CASE',
      target_id: caseId,
    },
    label: '3-presign',
  });
  assert(presignRes, 200, 'presign');
  const { evidence_id, s3_key } = presignRes.data;
  console.log(`   evidence_id: ${evidence_id}, s3_key: ${s3_key}`);

  // 4) Evidence register (with target) — S3 PUT 생략, sha256 mock
  const sha256 = 'a'.repeat(64);
  const registerRes = await api('POST', '/user/v1/evidence', {
    testTenantId: tenantId,
    body: {
      evidence_id,
      s3_key,
      sha256,
      size_bytes: 12345,
      mime_type: 'image/jpeg',
      target_type: 'CASE',
      target_id: caseId,
    },
    label: '4-register',
  });
  assert(registerRes, 201, 'register');

  // 5) Evidence list by target
  const listRes = await api('GET', `/user/v1/CASE/${caseId}/evidence`, {
    testTenantId: tenantId,
    label: '5-list',
  });
  assert(listRes, 200, 'list');

  const items = listRes.data.items || [];
  const found = items.find(e => (e.evidence_id || e.id) === evidence_id);
  if (!found) {
    console.error(`\n❌ FAIL: evidence_id ${evidence_id} not found in list`);
    process.exit(1);
  }
  console.log(`   ✅ Evidence found in list! (${items.length} items)`);

  // 6) Evidence presign (WITHOUT target — 하위호환 확인)
  const presign2Res = await api('POST', '/user/v1/evidence/presign', {
    testTenantId: tenantId,
    body: { filename: 'legacy.jpg', mime_type: 'image/jpeg' },
    label: '6-presign-legacy',
  });
  assert(presign2Res, 200, 'presign-legacy');

  // 7) Settlement list (빈 목록이어도 200이면 OK)
  const settlListRes = await api('GET', '/user/v1/settlements', {
    testTenantId: tenantId,
    label: '7-settlement-list',
  });
  assert(settlListRes, 200, 'settlement-list');
  console.log(`   settlements: ${(settlListRes.data.items || []).length} items`);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  ✅ ALL PASS: Evidence Target + List E2E');
  console.log('═══════════════════════════════════════════════════');
}

main().catch(e => {
  console.error(`\n❌ 예기치 않은 오류: ${e.message}`);
  process.exit(1);
});

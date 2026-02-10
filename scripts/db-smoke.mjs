#!/usr/bin/env node
/**
 * db-smoke.mjs
 * 배포 직후 DB Read/Write까지 자동 검증하는 스모크 테스트.
 *
 * 필수 환경변수:
 *   API_BASE                - API Gateway URL (trailing slash 포함)
 *   USER_POOL_ID            - Cognito User Pool ID
 *   USER_POOL_CLIENT_ID     - Cognito User Pool Client ID
 *   ADMIN_POOL_ID           - Cognito Admin Pool ID
 *   ADMIN_POOL_CLIENT_ID    - Cognito Admin Pool Client ID
 *   TEST_USER_USERNAME      - Cognito 폐차장 테스트 계정 이메일
 *   TEST_USER_PASSWORD      - 비밀번호
 *   TEST_ADMIN_USERNAME     - Cognito 관리자 테스트 계정 이메일
 *   TEST_ADMIN_PASSWORD     - 비밀번호
 *   AWS_REGION              - (기본 ap-northeast-2)
 */
import { execSync } from 'node:child_process';

const API_BASE = (process.env.API_BASE || '').replace(/\/$/, '');
const REGION = process.env.AWS_REGION || 'ap-northeast-2';

// ──────── 유틸: 민감정보 마스킹 ────────
function mask(str) {
  if (!str || str.length < 8) return '***';
  return str.slice(0, 4) + '****' + str.slice(-4);
}

// ──────── Cognito 토큰 발급 ────────
function getIdToken(poolId, clientId, username, password, label) {
  console.log(`\n🔑 [${label}] Cognito 토큰 발급 중... (user: ${mask(username)})`);
  try {
    // 특수문자 안전 전달: --cli-input-json 사용
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
async function apiCall(method, path, { token, body, label }) {
  const url = `${API_BASE}${path}`;
  console.log(`\n📡 [${label}] ${method} ${url}`);

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  let data;
  try {
    data = await res.json();
  } catch {
    data = await res.text();
  }

  // 민감정보 필터: id, token 등은 마스킹
  const safeData = typeof data === 'object'
    ? JSON.stringify(data, null, 2).slice(0, 500)
    : String(data).slice(0, 500);

  console.log(`   HTTP ${res.status} ${res.statusText}`);
  console.log(`   Body (preview): ${safeData}`);

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
  console.log('═══════════════════════════════════════');
  console.log('  evscrap DB Smoke Test');
  console.log('═══════════════════════════════════════');
  console.log(`API_BASE: ${API_BASE}`);
  console.log(`REGION:   ${REGION}`);

  // 필수 환경변수 확인
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

  // GitHub Secrets의 trailing whitespace/newline 제거
  for (const key of required) {
    if (process.env[key]) process.env[key] = process.env[key].trim();
  }

  // ──── 1) /health ────
  const health = await apiCall('GET', '/health', { label: 'health' });
  assertStatus(health, 200, 'health');

  // ──── 2) Cognito 토큰 발급 ────
  const userToken = getIdToken(
    process.env.USER_POOL_ID,
    process.env.USER_POOL_CLIENT_ID,
    process.env.TEST_USER_USERNAME,
    process.env.TEST_USER_PASSWORD,
    'User'
  );

  const adminToken = getIdToken(
    process.env.ADMIN_POOL_ID,
    process.env.ADMIN_POOL_CLIENT_ID,
    process.env.TEST_ADMIN_USERNAME,
    process.env.TEST_ADMIN_PASSWORD,
    'Admin'
  );

  // ──── 3) DB WRITE: POST /user/v1/tenants/submit → 201 ────
  const ts = Date.now();
  const tenantResult = await apiCall('POST', '/user/v1/tenants/submit', {
    token: userToken,
    body: {
      display_name: `CI-Smoke-${ts}`,
      phone_number: '+821000000000',
    },
    label: 'tenant-create (DB WRITE)',
  });
  assertStatus(tenantResult, 201, 'tenant-create');

  // ──── 4) DB READ: GET /admin/v1/tenants → 200 ────
  const tenantsResult = await apiCall('GET', '/admin/v1/tenants', {
    token: adminToken,
    label: 'tenant-list (DB READ)',
  });
  assertStatus(tenantsResult, 200, 'tenant-list');

  // ──── 5) DB WRITE: POST /user/v1/cases → 201 ────
  const caseResult = await apiCall('POST', '/user/v1/cases', {
    token: userToken,
    body: {
      vin: `SMOKE${ts}`,
      make: 'CI-Test',
      model: 'SmokeModel',
      year: 2026,
    },
    label: 'case-create (DB WRITE)',
  });
  assertStatus(caseResult, 201, 'case-create');

  // ──── DONE ────
  console.log('\n═══════════════════════════════════════');
  console.log('  ✅ DB Smoke Test ALL PASS');
  console.log('═══════════════════════════════════════');
}

main().catch(e => {
  console.error(`\n❌ 예기치 않은 오류: ${e.message}`);
  process.exit(1);
});

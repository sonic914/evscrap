#!/usr/bin/env node
/**
 * E2E: Settlement ACK (P2-4.1)
 *
 * 전략: "이미 존재하는 COMMITTED settlement"을 admin API로 조회하여 사용.
 * 없으면 DRAFT settlement을 admin approve → commit 하여 COMMITTED로 만듦.
 *
 * 테스트 케이스:
 *  1) COMMITTED가 아닌 settlement에 ACK → 409
 *  2) COMMITTED settlement ACK 성공 → 201
 *  3) 동일 사용자 재 ACK → 200 (멱등)
 *  4) Idempotency-Key 미전송 → 400
 *
 * 실행: node scripts/e2e-settlement-ack.mjs
 * 환경변수: API_BASE (기본 http://localhost:3000)
 */

const API = process.env.API_BASE || 'http://localhost:3000';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

async function json(res) {
  try { return await res.json(); } catch { return null; }
}

// ── helpers ──
async function userGet(path) {
  return fetch(`${API}${path}`, { headers: { Authorization: 'Bearer test' } });
}
async function userPost(path, body = {}, extraHeaders = {}) {
  return fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test', ...extraHeaders },
    body: JSON.stringify(body),
  });
}
async function adminGet(path) {
  return fetch(`${API}${path}`, { headers: { 'x-admin-key': 'test-admin-key' } });
}
async function adminPost(path, body = {}) {
  return fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': 'test-admin-key', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}

// ── find or create a settlement for testing ──
async function findOrCreateSettlement() {
  // 1) 기존 settlements 조회
  const listRes = await adminGet('/admin/v1/settlements');
  const list = await json(listRes);
  const settlements = list?.settlements || [];

  // COMMITTED settlement 찾기
  const committed = settlements.find(s => s.status === 'COMMITTED');
  if (committed) return { committed, nonCommitted: settlements.find(s => s.status !== 'COMMITTED') };

  // 2) non-committed 찾아서 approve → commit
  const draft = settlements.find(s => s.status === 'DRAFT' || s.status === 'READY_FOR_APPROVAL');
  if (draft) {
    await adminPost(`/admin/v1/settlements/${draft.settlement_id}/approve`);
    const commitRes = await adminPost(`/admin/v1/settlements/${draft.settlement_id}/commit`, { receipt_hash: 'e2e-test-hash-' + Date.now() });
    const commitBody = await json(commitRes);
    if (commitRes.ok && commitBody?.status === 'COMMITTED') {
      return { committed: commitBody, nonCommitted: null };
    }
  }

  const approved = settlements.find(s => s.status === 'APPROVED');
  if (approved) {
    const commitRes = await adminPost(`/admin/v1/settlements/${approved.settlement_id}/commit`, { receipt_hash: 'e2e-test-hash-' + Date.now() });
    const commitBody = await json(commitRes);
    if (commitRes.ok && commitBody?.status === 'COMMITTED') {
      return { committed: commitBody, nonCommitted: null };
    }
  }

  // 3) settlement이 아예 없으면: case 생성 → settlement 생성 → approve → commit
  console.log('  ℹ️  settlement 없음, 새로 생성...');
  const caseRes = await userPost('/user/v1/cases', { vin: 'TESTVIN' + Date.now() }, { 'Idempotency-Key': crypto.randomUUID() });
  const caseBody = await json(caseRes);
  const caseId = caseBody?.case_id;
  if (!caseId) { console.error('  ⚠️ case 생성 실패'); return { committed: null, nonCommitted: null }; }

  // event 생성 (앵커 검증 필요할 수 있음)
  await userPost(`/user/v1/CASE/${caseId}/events`, {
    event_type: 'INBOUND_CHECKED', occurred_at: new Date().toISOString(), payload: { notes: 'e2e' },
  }, { 'Idempotency-Key': crypto.randomUUID() });

  // settlement 생성
  await userPost(`/user/v1/CASE/${caseId}/settlement`, { amount_total: 100000, amount_min: 80000, amount_bonus: 20000 }, { 'Idempotency-Key': crypto.randomUUID() });

  // 잠시 대기 후 approve/commit 시도 (앵커 gate 때문에 실패할 수 있음)
  await new Promise(r => setTimeout(r, 2000));

  const sRes = await userGet(`/user/v1/CASE/${caseId}/settlement`);
  const sBody = await json(sRes);
  if (!sBody?.settlement_id) { console.error('  ⚠️ settlement 조회 실패'); return { committed: null, nonCommitted: sBody }; }

  // approve
  const apRes = await adminPost(`/admin/v1/settlements/${sBody.settlement_id}/approve`);
  if (!apRes.ok) {
    console.log('  ⚠️ approve 실패 (앵커 gate) - non-committed 테스트만 수행');
    return { committed: null, nonCommitted: sBody };
  }

  // commit
  const cmRes = await adminPost(`/admin/v1/settlements/${sBody.settlement_id}/commit`, { receipt_hash: 'e2e-hash-' + Date.now() });
  const cmBody = await json(cmRes);
  if (cmRes.ok && cmBody?.status === 'COMMITTED') {
    return { committed: cmBody, nonCommitted: null };
  }

  return { committed: null, nonCommitted: sBody };
}

// ── MAIN ──
async function main() {
  console.log('=== E2E: Settlement ACK (P2-4.1) ===');
  console.log(`API: ${API}\n`);

  const { committed, nonCommitted } = await findOrCreateSettlement();

  // ── Test 1: ACK on non-COMMITTED → 409 ──
  console.log('\n[Test 1] COMMITTED가 아닌 settlement에 ACK → 409');
  if (nonCommitted) {
    const res = await userPost(`/user/v1/settlements/${nonCommitted.settlement_id}/ack`, {}, { 'Idempotency-Key': crypto.randomUUID() });
    const body = await json(res);
    assert(res.status === 409, `status=${res.status} (expected 409)`);
    assert(body?.error_code === 'INVALID_STATUS_TRANSITION', `error_code=${body?.error_code}`);
  } else {
    console.log('  ⏭️ non-committed settlement 없음, 스킵');
  }

  // ── Test 2: ACK 성공 → 201 ──
  console.log('\n[Test 2] COMMITTED settlement ACK → 201');
  if (committed) {
    const res = await userPost(`/user/v1/settlements/${committed.settlement_id}/ack`, {}, { 'Idempotency-Key': crypto.randomUUID() });
    const body = await json(res);
    assert(res.status === 201 || res.status === 200, `status=${res.status} (expected 201 or 200)`);
    assert(body?.acked === true, `acked=${body?.acked}`);
    assert(!!body?.acked_at, `acked_at=${body?.acked_at}`);
  } else {
    console.log('  ⏭️ COMMITTED settlement 없음, 스킵 (앵커 gate 미통과)');
  }

  // ── Test 3: 동일 사용자 재 ACK → 200 (멱등) ──
  console.log('\n[Test 3] 동일 사용자 재 ACK → 200 (멱등)');
  if (committed) {
    const res = await userPost(`/user/v1/settlements/${committed.settlement_id}/ack`, {}, { 'Idempotency-Key': crypto.randomUUID() });
    const body = await json(res);
    assert(res.status === 200, `status=${res.status} (expected 200)`);
    assert(body?.acked === true, `acked=${body?.acked}`);
  } else {
    console.log('  ⏭️ 스킵');
  }

  // ── Test 4: Idempotency-Key 없이 ACK → 400 ──
  console.log('\n[Test 4] Idempotency-Key 헤더 누락 → 400');
  const anySettlementId = committed?.settlement_id || nonCommitted?.settlement_id || '00000000-0000-0000-0000-000000000000';
  const res4 = await fetch(`${API}/user/v1/settlements/${anySettlementId}/ack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: '{}',
  });
  const body4 = await json(res4);
  assert(res4.status === 400, `status=${res4.status} (expected 400)`);
  assert(body4?.error_code === 'MISSING_IDEMPOTENCY_KEY', `error_code=${body4?.error_code}`);

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`결과: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });

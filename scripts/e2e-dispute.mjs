#!/usr/bin/env node
/**
 * E2E: Settlement Dispute MVP
 *
 * 전략: COMMITTED settlement 준비가 무거우므로, 기존 e2e 체인에서 생성된
 *        COMMITTED settlement을 재사용하는 대신, admin API로 직접 상태 전이하여 준비.
 *
 * 케이스:
 * 1) COMMITTED settlement 준비
 * 2) user create dispute → 201
 * 3) user create dispute 다시 → 409 DISPUTE_ALREADY_OPEN
 * 4) user list disputes에 포함 확인
 * 5) admin list disputes에서 확인
 * 6) admin transition OPEN→UNDER_REVIEW
 * 7) admin transition UNDER_REVIEW→RESOLVED_ACCEPTED
 * 8) user get dispute에서 status 업데이트 확인
 */

const API = process.env.API_BASE;
const USER_TOKEN = process.env.USER_TOKEN;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!API || !USER_TOKEN || !ADMIN_TOKEN) {
  console.error('필수 환경변수: API_BASE, USER_TOKEN, ADMIN_TOKEN');
  process.exit(1);
}

const userH = { Authorization: `Bearer ${USER_TOKEN}`, 'Content-Type': 'application/json' };
const adminH = { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json' };

let pass = 0, fail = 0;
function assert(label, cond) {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.error(`  ❌ ${label}`); }
}

async function run() {
  console.log('\n=== E2E: Settlement Dispute ===\n');

  // 0) COMMITTED settlement 찾기
  console.log('[0] Finding COMMITTED settlement...');
  const sRes = await fetch(`${API}/admin/v1/settlements?status=COMMITTED`, { headers: adminH });
  const sList = await sRes.json();
  const settlements = sList.settlements || sList.items || [];
  if (settlements.length === 0) {
    console.error('❌ COMMITTED settlement 없음. 먼저 정산 플로우를 실행하세요.');
    process.exit(1);
  }
  const settlement = settlements[0];
  const settlementId = settlement.settlement_id || settlement.id;
  console.log(`  → settlement: ${settlementId.slice(0, 8)}… (${settlement.target_type}/${settlement.target_id?.slice(0, 8)}…)`);
  assert('COMMITTED settlement 존재', !!settlementId);

  // 1) user create dispute → 201
  console.log('\n[1] Create dispute...');
  const createRes = await fetch(`${API}/user/v1/settlements/${settlementId}/disputes`, {
    method: 'POST',
    headers: { ...userH, 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({
      reason_code: 'AMOUNT_ERROR',
      description: 'E2E 테스트: 금액이 예상과 다릅니다.',
    }),
  });
  const createBody = await createRes.json();
  assert('create → 201', createRes.status === 201);
  assert('status == OPEN', createBody.status === 'OPEN');
  const disputeId = createBody.dispute_id || createBody.id;
  console.log(`  → dispute: ${disputeId?.slice(0, 8)}…`);

  // 2) 중복 생성 → 409
  console.log('\n[2] Duplicate create → 409...');
  const dupRes = await fetch(`${API}/user/v1/settlements/${settlementId}/disputes`, {
    method: 'POST',
    headers: { ...userH, 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ reason_code: 'OTHER', description: '중복 테스트' }),
  });
  assert('duplicate → 409', dupRes.status === 409);
  const dupBody = await dupRes.json();
  assert('error_code == DISPUTE_ALREADY_OPEN', dupBody.error_code === 'DISPUTE_ALREADY_OPEN');

  // 3) user list disputes
  console.log('\n[3] User list disputes...');
  const listRes = await fetch(`${API}/user/v1/disputes`, { headers: userH });
  const listBody = await listRes.json();
  assert('list → 200', listRes.status === 200);
  assert('items includes dispute', (listBody.items || []).some(d => (d.dispute_id || d.id) === disputeId));

  // 4) admin list disputes
  console.log('\n[4] Admin list disputes...');
  const adminListRes = await fetch(`${API}/admin/v1/disputes?status=OPEN`, { headers: adminH });
  const adminListBody = await adminListRes.json();
  assert('admin list → 200', adminListRes.status === 200);
  assert('admin sees dispute', (adminListBody.items || []).some(d => (d.dispute_id || d.id) === disputeId));

  // 5) admin transition OPEN → UNDER_REVIEW
  console.log('\n[5] Transition OPEN → UNDER_REVIEW...');
  const t1Res = await fetch(`${API}/admin/v1/disputes/${disputeId}/transition`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({ next_status: 'UNDER_REVIEW', current_status: 'OPEN', admin_note: 'E2E: 검토 시작' }),
  });
  const t1Body = await t1Res.json();
  assert('transition → 200', t1Res.status === 200);
  assert('status == UNDER_REVIEW', t1Body.status === 'UNDER_REVIEW');

  // 6) admin transition UNDER_REVIEW → RESOLVED_ACCEPTED
  console.log('\n[6] Transition UNDER_REVIEW → RESOLVED_ACCEPTED...');
  const t2Res = await fetch(`${API}/admin/v1/disputes/${disputeId}/transition`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({ next_status: 'RESOLVED_ACCEPTED', current_status: 'UNDER_REVIEW', admin_note: 'E2E: 이의 인정' }),
  });
  const t2Body = await t2Res.json();
  assert('transition → 200', t2Res.status === 200);
  assert('status == RESOLVED_ACCEPTED', t2Body.status === 'RESOLVED_ACCEPTED');

  // 7) user get dispute → RESOLVED_ACCEPTED
  console.log('\n[7] User get dispute final state...');
  const getRes = await fetch(`${API}/user/v1/disputes/${disputeId}`, { headers: userH });
  const getBody = await getRes.json();
  assert('get → 200', getRes.status === 200);
  assert('final status == RESOLVED_ACCEPTED', getBody.status === 'RESOLVED_ACCEPTED');
  assert('admin_note present', !!getBody.admin_note);

  // Summary
  console.log(`\n${'='.repeat(40)}`);
  console.log(`✅ Pass: ${pass}  ❌ Fail: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });

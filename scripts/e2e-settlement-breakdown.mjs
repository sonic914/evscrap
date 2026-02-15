#!/usr/bin/env node
/**
 * E2E: 정산 Breakdown 검증 스크립트
 *
 * 사전조건:
 *   - DB에 최소 1개 Settlement이 존재 (e2e-evidence-target.mjs 등으로 생성)
 *   - 환경변수: API_URL, USER_TOKEN, ADMIN_TOKEN
 *
 * 사용법:
 *   API_URL=https://xxx USER_TOKEN=... ADMIN_TOKEN=... node scripts/e2e-settlement-breakdown.mjs
 */

const API = process.env.API_URL;
const USER_TOKEN = process.env.USER_TOKEN;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!API || !USER_TOKEN || !ADMIN_TOKEN) {
  console.error('❌ API_URL, USER_TOKEN, ADMIN_TOKEN 환경변수 필요');
  process.exit(1);
}

const h = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
let pass = 0, fail = 0;

function assert(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); pass++; }
  else { console.error(`  ❌ ${label}`); fail++; }
}

async function main() {
  console.log('\n=== E2E: Settlement Breakdown ===\n');

  // 1. 정산 목록에서 첫 번째 정산 가져오기
  console.log('1️⃣ User: 정산 목록 조회');
  const listRes = await fetch(`${API}/user/v1/settlements`, { headers: h(USER_TOKEN) });
  assert('GET /user/v1/settlements → 200', listRes.status === 200);
  const listData = await listRes.json();
  const settlements = listData.items || [];
  console.log(`   정산 ${settlements.length}건`);

  if (settlements.length === 0) {
    console.log('⚠️ 정산이 없어서 breakdown 테스트 스킵. 먼저 정산을 생성해주세요.');
    return;
  }

  const settlement = settlements[0];
  const { target_type, target_id, settlement_id } = settlement;
  console.log(`   대상: ${target_type}/${target_id}, 정산ID: ${settlement_id}`);

  // 2. User Breakdown 조회
  console.log('\n2️⃣ User: Breakdown 조회');
  const bdRes = await fetch(`${API}/user/v1/${target_type}/${target_id}/settlement/breakdown`, { headers: h(USER_TOKEN) });
  assert(`GET .../${target_type}/${target_id}/settlement/breakdown → 200`, bdRes.status === 200);
  const bd = await bdRes.json();

  assert('settlement_id 일치', bd.settlement_id === settlement_id);
  assert('items 배열 존재', Array.isArray(bd.items));
  assert('items.length >= 1', bd.items.length >= 1);

  // summary 키 5개 존재 확인
  assert('summary 존재', bd.summary != null);
  assert('summary.min 존재 (number)', typeof bd.summary.min === 'number');
  assert('summary.bonus 존재 (number)', typeof bd.summary.bonus === 'number');
  assert('summary.deduction 존재 (number)', typeof bd.summary.deduction === 'number');
  assert('summary.other 존재 (number)', typeof bd.summary.other === 'number');
  assert('summary.total 존재 (number)', typeof bd.summary.total === 'number');

  // consistency 확장 친화 규칙 검증
  assert('consistency 존재', bd.consistency != null);
  assert('consistency.ok boolean', typeof bd.consistency.ok === 'boolean');
  assert('consistency.ok === true', bd.consistency.ok === true);
  const EXPECTED_RULE = 'amount_min=sum(MIN); amount_bonus=sum(NON_MIN); amount_total=sum(ALL)';
  assert(`consistency.rule == "${EXPECTED_RULE}"`, bd.consistency.rule === EXPECTED_RULE);

  // consistency.details 검증 (optional but present)
  if (bd.consistency.details) {
    assert('details.min_ok boolean', typeof bd.consistency.details.min_ok === 'boolean');
    assert('details.bonus_ok boolean', typeof bd.consistency.details.bonus_ok === 'boolean');
    assert('details.total_ok boolean', typeof bd.consistency.details.total_ok === 'boolean');
    assert('details 모두 true', bd.consistency.details.min_ok && bd.consistency.details.bonus_ok && bd.consistency.details.total_ok);
  }

  // 각 item 검증
  for (const item of bd.items) {
    assert(`item[${item.code}] has id, title, category, amount`, !!(item.id && item.title && item.category && item.amount != null));
  }

  console.log(`   summary: min=${bd.summary.min}, bonus=${bd.summary.bonus}, deduction=${bd.summary.deduction}, total=${bd.summary.total}`);

  // 3. Admin Breakdown 조회
  console.log('\n3️⃣ Admin: Breakdown 조회');
  const adminBdRes = await fetch(`${API}/admin/v1/settlements/${settlement_id}/breakdown`, { headers: h(ADMIN_TOKEN) });
  assert(`GET /admin/v1/settlements/${settlement_id.slice(0,8)}.../breakdown → 200`, adminBdRes.status === 200);
  const adminBd = await adminBdRes.json();

  assert('admin items == user items (같은 수)', adminBd.items.length === bd.items.length);
  assert('admin summary.total == user summary.total', adminBd.summary.total === bd.summary.total);
  assert('admin consistency.ok', adminBd.consistency.ok === true);

  // 4. 멱등성 검증: breakdown 2회 연속 호출 시 중복 없음
  console.log('\n4️⃣ 멱등성: breakdown 2회 호출 → items 코드 중복 없음');
  const bd2Res = await fetch(`${API}/user/v1/${target_type}/${target_id}/settlement/breakdown`, { headers: h(USER_TOKEN) });
  assert('2회 호출 → 200', bd2Res.status === 200);
  const bd2 = await bd2Res.json();
  assert('2회 호출 items.length 동일', bd2.items.length === bd.items.length);
  const codes2 = bd2.items.map(i => i.code);
  const uniqueCodes2 = new Set(codes2);
  assert('items 코드 중복 없음 (Set 크기 == 배열 길이)', uniqueCodes2.size === codes2.length);

  // 5. 404 케이스
  console.log('\n5️⃣ Edge: 없는 settlement breakdown');
  const notFoundRes = await fetch(`${API}/admin/v1/settlements/00000000-0000-0000-0000-000000000000/breakdown`, { headers: h(ADMIN_TOKEN) });
  assert('없는 정산 → 404', notFoundRes.status === 404);

  // 결과
  console.log(`\n━━━ 결과: ${pass} pass / ${fail} fail ━━━`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });

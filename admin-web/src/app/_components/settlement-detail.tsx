'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import NavBar from '../NavBar';
import { useAuthGuard, handle401 } from '@/lib/useAuthGuard';
import { getAdminApi, adminGet, makeIdempotencyKey } from '@/lib/api';
import { mapApiError, type ApiErrorInfo } from '@/lib/errors';
import type { components } from '@evscrap/api-client';

type Settlement = components['schemas']['Settlement'];

interface BreakdownItem {
  id: string; code: string; title: string; category: string; amount: number;
  quantity?: number | null; unit?: string | null; unit_price?: number | null;
  evidence_ref?: string | null; note?: string | null; created_at: string;
}
interface BreakdownData {
  settlement_id: string; items: BreakdownItem[];
  summary: { min: number; bonus: number; deduction: number; other: number; total: number };
  consistency: { rule: string; ok: boolean };
}

const CAT_LABEL: Record<string, string> = { MIN: '최소 보장', BONUS: '보너스', DEDUCTION: '차감', LOGISTICS: '물류비', OTHER: '기타' };
const CAT_COLOR: Record<string, string> = { MIN: '#17a2b8', BONUS: '#28a745', DEDUCTION: '#dc3545', LOGISTICS: '#fd7e14', OTHER: '#6c757d' };

function statusBadge(status: string) {
  const s = status.toLowerCase().replace('ready_for_approval', 'pending');
  return <span className={`badge badge-${s}`}>{status}</span>;
}

function formatAmount(n?: number) {
  if (n == null) return '-';
  return n.toLocaleString('ko-KR') + '원';
}

export default function SettlementDetailClient() {
  const router = useRouter();
  const params = useParams();
  const settlementId = params.id as string;
  const authed = useAuthGuard();

  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [receiptHash, setReceiptHash] = useState('');

  useEffect(() => {
    if (!authed) return;
    fetchSettlement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, settlementId]);

  async function fetchSettlement() {
    setLoading(true);
    setError(null);
    try {
      const api = getAdminApi();
      const { data, error: apiErr, response } = await api.GET('/admin/v1/settlements/{id}', {
        params: { path: { id: settlementId } },
      });
      if (handle401(response?.status, router)) return;
      if (apiErr || !data) {
        setError(mapApiError(apiErr));
        return;
      }
      setSettlement(data as Settlement);
      // breakdown 로드 (실패해도 settlement은 표시)
      try {
        const bdRes = await adminGet<BreakdownData>(`/admin/v1/settlements/${settlementId}/breakdown`);
        if (bdRes.data) setBreakdown(bdRes.data);
      } catch { /* ignore */ }
    } catch (err) {
      setError({ code: 'UNKNOWN', message: err instanceof Error ? err.message : '알 수 없는 오류' });
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!confirm('이 정산을 승인하시겠습니까?')) return;
    setActionLoading(true);
    setError(null);
    setSuccessMsg('');
    try {
      const api = getAdminApi();
      const { data, error: apiErr, response } = await api.POST('/admin/v1/settlements/{id}/approve', {
        params: { path: { id: settlementId } },
        headers: { 'Idempotency-Key': makeIdempotencyKey() },
        body: {},
      });
      if (handle401(response?.status, router)) return;
      if (apiErr) {
        setError(mapApiError(apiErr));
        return;
      }
      setSettlement(data as Settlement);
      setSuccessMsg('✅ 정산이 승인되었습니다.');
    } catch (err) {
      setError({ code: 'UNKNOWN', message: err instanceof Error ? err.message : '승인 실패' });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCommit() {
    if (!receiptHash.trim()) {
      setError({ code: 'VALIDATION', message: 'receipt_hash를 입력하세요.' });
      return;
    }
    if (!confirm('이 정산을 확정(commit)하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
    setActionLoading(true);
    setError(null);
    setSuccessMsg('');
    try {
      const api = getAdminApi();
      const { data, error: apiErr, response } = await api.POST('/admin/v1/settlements/{id}/commit', {
        params: { path: { id: settlementId } },
        headers: { 'Idempotency-Key': makeIdempotencyKey() },
        body: { receipt_hash: receiptHash.trim() },
      });
      if (handle401(response?.status, router)) return;
      if (apiErr) {
        setError(mapApiError(apiErr));
        return;
      }
      setSettlement(data as Settlement);
      setSuccessMsg('✅ 정산이 확정(COMMITTED)되었습니다.');
    } catch (err) {
      setError({ code: 'UNKNOWN', message: err instanceof Error ? err.message : '확정 실패' });
    } finally {
      setActionLoading(false);
    }
  }

  if (!authed) return <div className="loading">인증 확인 중...</div>;

  return (
    <>
      <NavBar />
      <div className="page">
        <div style={{ marginBottom: 16 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); router.push('/settlements'); }}>← 정산 목록</a>
        </div>
        <h1>정산 상세</h1>

        {error?.isAnchorGate && (
          <div className="alert alert-gate">
            🚫 {error.message}
            <div style={{ marginTop: 8 }}><button onClick={fetchSettlement}>🔄 새로고침</button></div>
          </div>
        )}
        {error && !error.isAnchorGate && <div className="alert alert-error">{error.message}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}

        {loading ? (
          <div className="loading">로딩 중...</div>
        ) : settlement ? (
          <>
            <div className="detail-card">
              <div className="detail-row"><span className="detail-label">Settlement ID</span><span className="detail-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{settlement.settlement_id}</span></div>
              <div className="detail-row"><span className="detail-label">대상 타입</span><span className="detail-value">{settlement.target_type}</span></div>
              <div className="detail-row"><span className="detail-label">대상 ID</span><span className="detail-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{settlement.target_id}</span></div>
              <div className="detail-row"><span className="detail-label">상태</span><span className="detail-value">{statusBadge(settlement.status)}</span></div>
              <div className="detail-row"><span className="detail-label">최소 금액</span><span className="detail-value">{formatAmount(settlement.amount_min)}</span></div>
              <div className="detail-row"><span className="detail-label">보너스</span><span className="detail-value">{formatAmount(settlement.amount_bonus)}</span></div>
              <div className="detail-row"><span className="detail-label">총액</span><span className="detail-value" style={{ fontWeight: 700 }}>{formatAmount(settlement.amount_total)}</span></div>
              {settlement.receipt_hash && (
                <div className="detail-row"><span className="detail-label">영수증 해시</span><span className="detail-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{settlement.receipt_hash}</span></div>
              )}
              <div className="detail-row"><span className="detail-label">생성일</span><span className="detail-value">{new Date(settlement.created_at).toLocaleString('ko')}</span></div>
              {settlement.updated_at && (
                <div className="detail-row"><span className="detail-label">수정일</span><span className="detail-value">{new Date(settlement.updated_at).toLocaleString('ko')}</span></div>
              )}
            </div>

            {(settlement.status === 'DRAFT' || settlement.status === 'READY_FOR_APPROVAL') && (
              <div className="actions">
                <button className="primary" onClick={handleApprove} disabled={actionLoading}>
                  {actionLoading ? '처리 중...' : '✅ 승인 (Approve)'}
                </button>
              </div>
            )}

            {settlement.status === 'APPROVED' && (
              <div className="detail-card" style={{ marginTop: 16 }}>
                <h2>정산 확정 (Commit)</h2>
                <div className="form-group" style={{ marginTop: 8 }}>
                  <label>Receipt Hash (필수)</label>
                  <input type="text" value={receiptHash} onChange={(e) => setReceiptHash(e.target.value)} placeholder="영수증 해시값을 입력하세요" />
                </div>
                <button className="danger" onClick={handleCommit} disabled={actionLoading}>
                  {actionLoading ? '처리 중...' : '🔒 확정 (Commit)'}
                </button>
              </div>
            )}

            {settlement.status === 'COMMITTED' && (
              <div className="alert alert-success" style={{ marginTop: 16 }}>이 정산은 이미 확정(COMMITTED) 되었습니다.</div>
            )}

            {/* 사용자 ACK 상태 표시 */}
            <div className="detail-card" style={{ marginTop: 16 }}>
              <h2>👤 사용자 확인 (ACK)</h2>
              {(settlement as any).acked ? (
                <div style={{ padding: 8, background: '#d4edda', borderRadius: 4, fontSize: 13, color: '#155724' }}>
                  ✅ 사용자 확인 완료
                  {(settlement as any).acked_at && (
                    <span style={{ marginLeft: 8 }}>({new Date((settlement as any).acked_at).toLocaleString('ko')})</span>
                  )}
                  {(settlement as any).ack_user_sub && (
                    <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11 }}>user: {(settlement as any).ack_user_sub}</span>
                  )}
                  {(settlement as any).anchor_status && (
                    <span style={{
                      marginLeft: 8, padding: '2px 8px', borderRadius: 8, fontSize: 11, color: '#fff',
                      background: (settlement as any).anchor_status === 'VERIFIED' ? '#28a745'
                        : (settlement as any).anchor_status === 'PENDING' ? '#fd7e14'
                        : (settlement as any).anchor_status === 'FAILED' ? '#dc3545' : '#6c757d',
                    }}>
                      앵커: {(settlement as any).anchor_status}
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ padding: 8, background: '#fff3cd', borderRadius: 4, fontSize: 13, color: '#856404' }}>
                  ⏳ 사용자 미확인
                </div>
              )}
            </div>

            {/* Breakdown 섹션 */}
            <div className="detail-card" style={{ marginTop: 16 }}>
              <h2>📊 정산 구성 (Breakdown)</h2>
              {breakdown && breakdown.items.length > 0 ? (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                        <th style={{ padding: 6 }}>코드</th>
                        <th style={{ padding: 6 }}>항목명</th>
                        <th style={{ padding: 6, textAlign: 'center' }}>분류</th>
                        <th style={{ padding: 6, textAlign: 'right' }}>금액</th>
                        <th style={{ padding: 6 }}>비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.items.map(item => (
                        <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 11 }}>{item.code}</td>
                          <td style={{ padding: 6 }}>
                            {item.title}
                            {item.quantity != null && item.unit && (
                              <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>
                                ({item.quantity} {item.unit}{item.unit_price != null ? ` × ${formatAmount(item.unit_price)}` : ''})
                              </span>
                            )}
                          </td>
                          <td style={{ padding: 6, textAlign: 'center' }}>
                            <span style={{ padding: '2px 6px', borderRadius: 6, fontSize: 10, color: '#fff', background: CAT_COLOR[item.category] || '#999' }}>
                              {CAT_LABEL[item.category] || item.category}
                            </span>
                          </td>
                          <td style={{ padding: 6, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: item.amount < 0 ? '#dc3545' : undefined }}>
                            {formatAmount(item.amount)}
                          </td>
                          <td style={{ padding: 6, fontSize: 11, color: '#888' }}>{item.note || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid #333', fontWeight: 'bold' }}>
                        <td colSpan={3} style={{ padding: 6 }}>합계</td>
                        <td style={{ padding: 6, textAlign: 'right' }}>{formatAmount(breakdown.summary.total)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, flexWrap: 'wrap' }}>
                    {breakdown.summary.min > 0 && <span>최소보장: {formatAmount(breakdown.summary.min)}</span>}
                    {breakdown.summary.bonus > 0 && <span style={{ color: '#28a745' }}>보너스: +{formatAmount(breakdown.summary.bonus)}</span>}
                    {breakdown.summary.deduction !== 0 && <span style={{ color: '#dc3545' }}>차감: {formatAmount(breakdown.summary.deduction)}</span>}
                  </div>
                  <div style={{
                    marginTop: 8, padding: 8, borderRadius: 4, fontSize: 12,
                    background: breakdown.consistency.ok ? '#d4edda' : '#fff3cd',
                    color: breakdown.consistency.ok ? '#155724' : '#856404',
                  }}>
                    {breakdown.consistency.ok
                      ? `✅ 정합성 통과 (${breakdown.consistency.rule})`
                      : `⚠️ 정합성 불일치: 항목합계(${formatAmount(breakdown.summary.total)}) ≠ 총액(${formatAmount(settlement.amount_total)})`}
                  </div>
                </>
              ) : (
                <p style={{ color: '#999', marginTop: 8 }}>Breakdown 항목이 없습니다.</p>
              )}
            </div>
          </>
        ) : (
          <div className="alert alert-error">정산을 찾을 수 없습니다</div>
        )}
      </div>
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import NavBar from '../../NavBar';
import { useAuthGuard, handle401 } from '@/lib/useAuthGuard';
import { getAdminApi, makeIdempotencyKey } from '@/lib/api';
import { mapApiError, type ApiErrorInfo } from '@/lib/errors';
import type { components } from '@evscrap/api-client';

type Settlement = components['schemas']['Settlement'];

function statusBadge(status: string) {
  const s = status.toLowerCase().replace('ready_for_approval', 'pending');
  return <span className={`badge badge-${s}`}>{status}</span>;
}

function formatAmount(n?: number) {
  if (n == null) return '-';
  return n.toLocaleString('ko-KR') + '원';
}

export default function SettlementDetailPage() {
  const router = useRouter();
  const params = useParams();
  const settlementId = params.id as string;
  const authed = useAuthGuard();

  const [settlement, setSettlement] = useState<Settlement | null>(null);
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

        {/* 🚨 ANCHOR_NOT_VERIFIED 게이트 경고 */}
        {error?.isAnchorGate && (
          <div className="alert alert-gate">
            🚫 {error.message}
            <div style={{ marginTop: 8 }}>
              <button onClick={fetchSettlement}>🔄 새로고침</button>
            </div>
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

            {/* Approve 버튼 */}
            {(settlement.status === 'DRAFT' || settlement.status === 'READY_FOR_APPROVAL') && (
              <div className="actions">
                <button className="primary" onClick={handleApprove} disabled={actionLoading}>
                  {actionLoading ? '처리 중...' : '✅ 승인 (Approve)'}
                </button>
              </div>
            )}

            {/* Commit 영역 */}
            {settlement.status === 'APPROVED' && (
              <div className="detail-card" style={{ marginTop: 16 }}>
                <h2>정산 확정 (Commit)</h2>
                <div className="form-group" style={{ marginTop: 8 }}>
                  <label>Receipt Hash (필수)</label>
                  <input
                    type="text"
                    value={receiptHash}
                    onChange={(e) => setReceiptHash(e.target.value)}
                    placeholder="영수증 해시값을 입력하세요"
                  />
                </div>
                <button className="danger" onClick={handleCommit} disabled={actionLoading}>
                  {actionLoading ? '처리 중...' : '🔒 확정 (Commit)'}
                </button>
              </div>
            )}

            {settlement.status === 'COMMITTED' && (
              <div className="alert alert-success" style={{ marginTop: 16 }}>
                이 정산은 이미 확정(COMMITTED) 되었습니다.
              </div>
            )}
          </>
        ) : (
          <div className="alert alert-error">정산을 찾을 수 없습니다</div>
        )}
      </div>
    </>
  );
}

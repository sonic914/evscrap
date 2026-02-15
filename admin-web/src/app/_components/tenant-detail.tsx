'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import NavBar from '../NavBar';
import { useAuthGuard, handle401 } from '@/lib/useAuthGuard';
import { getAdminApi, makeIdempotencyKey } from '@/lib/api';
import { mapApiError } from '@/lib/errors';
import type { components } from '@evscrap/api-client';

type Tenant = components['schemas']['Tenant'];

function statusBadge(status: string) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>;
}

export default function TenantDetailClient() {
  const router = useRouter();
  const params = useParams();
  const tenantId = params.tenantId as string;
  const authed = useAuthGuard();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!authed) return;
    fetchTenant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, tenantId]);

  async function fetchTenant() {
    setLoading(true);
    setError('');
    try {
      const api = getAdminApi();
      const { data, error: apiErr, response } = await api.GET('/admin/v1/tenants/{id}', {
        params: { path: { id: tenantId } },
      });
      if (handle401(response?.status, router)) return;
      if (apiErr || !data) { setError('테넌트 조회 실패'); return; }
      setTenant(data as Tenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!confirm('이 테넌트를 승인하시겠습니까?')) return;
    setApproving(true);
    setError('');
    setSuccessMsg('');
    try {
      const api = getAdminApi();
      const { data, error: apiErr, response } = await api.POST('/admin/v1/tenants/{id}/approve', {
        params: { path: { id: tenantId } },
        headers: { 'Idempotency-Key': makeIdempotencyKey() },
        body: {},
      });
      if (handle401(response?.status, router)) return;
      if (apiErr) {
        const mapped = mapApiError(apiErr);
        setError(mapped.message);
        return;
      }
      setTenant(data as Tenant);
      setSuccessMsg('✅ 테넌트가 승인되었습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '승인 실패');
    } finally {
      setApproving(false);
    }
  }

  if (!authed) return <div className="loading">인증 확인 중...</div>;

  return (
    <>
      <NavBar />
      <div className="page">
        <div style={{ marginBottom: 16 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); router.push('/tenants'); }}>← 테넌트 목록</a>
        </div>
        <h1>테넌트 상세</h1>

        {error && <div className="alert alert-error">{error}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}

        {loading ? (
          <div className="loading">로딩 중...</div>
        ) : tenant ? (
          <>
            <div className="detail-card">
              <div className="detail-row"><span className="detail-label">ID</span><span className="detail-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{tenant.tenant_id}</span></div>
              <div className="detail-row"><span className="detail-label">이름</span><span className="detail-value">{tenant.display_name}</span></div>
              <div className="detail-row"><span className="detail-label">상태</span><span className="detail-value">{statusBadge(tenant.status)}</span></div>
              <div className="detail-row"><span className="detail-label">전화번호</span><span className="detail-value">{tenant.phone_number}</span></div>
              <div className="detail-row"><span className="detail-label">사업자번호</span><span className="detail-value">{tenant.business_number || '-'}</span></div>
              <div className="detail-row"><span className="detail-label">주소</span><span className="detail-value">{tenant.address || '-'}</span></div>
              <div className="detail-row"><span className="detail-label">생성일</span><span className="detail-value">{new Date(tenant.created_at).toLocaleString('ko')}</span></div>
              {tenant.approved_at && (
                <div className="detail-row"><span className="detail-label">승인일</span><span className="detail-value">{new Date(tenant.approved_at).toLocaleString('ko')}</span></div>
              )}
              {tenant.approved_by && (
                <div className="detail-row"><span className="detail-label">승인자</span><span className="detail-value">{tenant.approved_by}</span></div>
              )}
            </div>

            <div className="actions">
              {tenant.status === 'PENDING' && (
                <button className="primary" onClick={handleApprove} disabled={approving}>
                  {approving ? '승인 처리 중...' : '✅ 승인'}
                </button>
              )}
              {tenant.status === 'APPROVED' && (
                <span style={{ color: '#155724', fontWeight: 600 }}>이미 승인된 테넌트입니다</span>
              )}
            </div>
          </>
        ) : (
          <div className="alert alert-error">테넌트를 찾을 수 없습니다</div>
        )}
      </div>
    </>
  );
}

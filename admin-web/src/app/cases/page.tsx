'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '../NavBar';
import { useAuthGuard, handle401 } from '@/lib/useAuthGuard';
import { adminGet } from '@/lib/api';

interface CaseItem {
  case_id: string;
  vin: string;
  make?: string;
  model?: string;
  year?: number;
  tenant_id: string;
  created_at: string;
}

export default function CasesPage() {
  const router = useRouter();
  const authed = useAuthGuard();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 필터
  const [tenantId, setTenantId] = useState('');
  const [vin, setVin] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [goToCaseId, setGoToCaseId] = useState('');

  useEffect(() => {
    if (!authed) return;
    fetchCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  async function fetchCases() {
    setLoading(true);
    setError('');
    try {
      const query: Record<string, string> = {};
      if (tenantId.trim()) query.tenant_id = tenantId.trim();
      if (vin.trim()) query.vin = vin.trim();
      if (from) query.from = from;
      if (to) query.to = to;

      const { data, error: apiErr, response } = await adminGet('/admin/v1/cases', {
        params: { query },
      });
      if (handle401(response?.status, router)) return;
      if (apiErr) { setError('케이스 목록 조회 실패'); return; }
      setCases((data as any)?.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    fetchCases();
  }

  function handleGoToCase(e: FormEvent) {
    e.preventDefault();
    if (goToCaseId.trim()) {
      router.push(`/cases/${goToCaseId.trim()}`);
    }
  }

  if (!authed) return <div className="loading">인증 확인 중...</div>;

  return (
    <>
      <NavBar />
      <div className="page">
        <h1>케이스 관리</h1>

        {/* 필터 폼 */}
        <div className="detail-card" style={{ marginBottom: 16 }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label>Tenant ID</label>
              <input type="text" value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="UUID (선택)" />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 150px' }}>
              <label>VIN</label>
              <input type="text" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="검색어" />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 140px' }}>
              <label>From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 140px' }}>
              <label>To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <button type="submit" className="primary" style={{ height: 38 }}>🔍 검색</button>
          </form>
        </div>

        {/* 바로가기 */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <form onSubmit={handleGoToCase} style={{ display: 'flex', gap: 8 }}>
            <input type="text" value={goToCaseId} onChange={(e) => setGoToCaseId(e.target.value)} placeholder="Case ID로 바로가기" style={{ width: 300 }} />
            <button type="submit">이동 →</button>
          </form>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {loading ? (
          <div className="loading">로딩 중...</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Case ID</th>
                <th>VIN</th>
                <th>차량</th>
                <th>Tenant ID</th>
                <th>생성일</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.case_id} className="clickable" onClick={() => router.push(`/cases/${c.case_id}`)}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.case_id.slice(0, 8)}…</td>
                  <td>{c.vin}</td>
                  <td>{[c.make, c.model, c.year].filter(Boolean).join(' ') || '-'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.tenant_id.slice(0, 8)}…</td>
                  <td>{new Date(c.created_at).toLocaleDateString('ko')}</td>
                </tr>
              ))}
              {cases.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>케이스가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

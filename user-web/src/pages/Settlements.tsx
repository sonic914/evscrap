import { useEffect, useState, useCallback, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { isLoggedIn, logout } from '../lib/auth';
import { getUserApi, handle401 } from '../lib/api';
import { formatAmount } from '../lib/money';

interface SettlementRow {
  settlement_id: string;
  target_type: string;
  target_id: string;
  status: string;
  amount_total: number;
  created_at: string;
  updated_at?: string;
}

type PageMode = 'loading' | 'server' | 'fallback' | 'error';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#6c757d',
  READY_FOR_APPROVAL: '#fd7e14',
  APPROVED: '#28a745',
  COMMITTED: '#007bff',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '초안',
  READY_FOR_APPROVAL: '승인 대기',
  APPROVED: '승인됨',
  COMMITTED: '확정',
};

const STATUS_HINTS: Record<string, string> = {
  DRAFT: '아직 확정 전입니다',
  READY_FOR_APPROVAL: '아직 확정 전입니다',
  APPROVED: '승인됨 (확정 전)',
  COMMITTED: '확정 완료',
};

export default function SettlementsPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<PageMode>('loading');
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  // 폴백용
  const [caseId, setCaseId] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) navigate('/login');
  }, [navigate]);

  const fetchSettlements = useCallback(async () => {
    setMode('loading');
    setErrorMsg('');
    try {
      const api = getUserApi();
      const { data, error: apiErr, response } = await api.GET('/user/v1/settlements');

      if (handle401(response?.status, navigate)) return;

      // 404/501/네트워크 → 폴백
      if (response?.status === 404 || response?.status === 501) {
        setMode('fallback');
        return;
      }

      if (apiErr || !data) {
        setMode('error');
        setErrorMsg('정산 목록 조회 실패');
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      const items: SettlementRow[] = (d.items || []).map((s: any) => ({
        settlement_id: s.settlement_id || s.id,
        target_type: s.target_type || s.targetType,
        target_id: s.target_id || s.targetId,
        status: s.status,
        amount_total: s.amount_total ?? s.amountTotal ?? 0,
        created_at: s.created_at || s.createdAt,
        updated_at: s.updated_at || s.updatedAt,
      }));

      setSettlements(items);
      setMode('server');
    } catch {
      setMode('error');
      setErrorMsg('네트워크 오류');
    }
  }, [navigate]);

  useEffect(() => {
    fetchSettlements();
  }, [fetchSettlements]);

  function handleFallbackGo(e: FormEvent) {
    e.preventDefault();
    if (caseId.trim()) navigate(`/settlements/CASE/${caseId.trim()}`);
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>💰 정산</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/">← 홈</Link>
          <button onClick={() => { logout(); navigate('/login'); }}>로그아웃</button>
        </div>
      </div>

      {/* 로딩 */}
      {mode === 'loading' && (
        <p style={{ color: '#888' }}>📡 정산 목록 조회 중…</p>
      )}

      {/* 에러 + 재시도 */}
      {mode === 'error' && (
        <div style={{ padding: 12, background: '#fdd', borderRadius: 8, marginBottom: 16 }}>
          <span>❌ {errorMsg}</span>
          <button onClick={fetchSettlements} style={{ marginLeft: 8, padding: '4px 12px' }}>🔄 다시 시도</button>
        </div>
      )}

      {/* 서버 모드: 테이블 */}
      {mode === 'server' && (
        <>
          {settlements.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#888', border: '1px solid #eee', borderRadius: 8 }}>
              등록된 정산이 없습니다.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #333', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>정산 ID</th>
                  <th style={{ padding: 8 }}>대상</th>
                  <th style={{ padding: 8 }}>상태</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>총액</th>
                  <th style={{ padding: 8 }}>수정일</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr
                    key={s.settlement_id}
                    onClick={() => navigate(`/settlements/${s.target_type}/${s.target_id}`)}
                    style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 12 }}>
                      {s.settlement_id.slice(0, 8)}…
                    </td>
                    <td style={{ padding: 8, fontSize: 13 }}>
                      {s.target_type} / <code style={{ fontSize: 11 }}>{s.target_id.slice(0, 8)}…</code>
                    </td>
                    <td style={{ padding: 8 }}>
                      <span
                        style={{
                          padding: '2px 10px',
                          borderRadius: 12,
                          color: '#fff',
                          fontSize: 12,
                          background: STATUS_COLORS[s.status] || '#999',
                        }}
                        title={STATUS_HINTS[s.status] || ''}
                      >
                        {STATUS_LABELS[s.status] || s.status}
                      </span>
                    </td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 'bold' }}>
                      {formatAmount(s.amount_total)}
                    </td>
                    <td style={{ padding: 8, fontSize: 12, color: '#666' }}>
                      {new Date(s.updated_at || s.created_at).toLocaleString('ko')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 서버 모드에서도 수동 조회 가능 */}
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#666' }}>
              🔍 Case ID로 직접 조회
            </summary>
            <form onSubmit={handleFallbackGo} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                type="text"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                placeholder="Case ID (UUID)"
                style={{ flex: 1, padding: 8 }}
              />
              <button type="submit" disabled={!caseId.trim()} style={{ padding: '8px 16px' }}>조회 →</button>
            </form>
          </details>
        </>
      )}

      {/* 폴백 모드: 기존 caseId 입력 */}
      {mode === 'fallback' && (
        <>
          <div style={{ padding: 12, border: '1px solid #f0ad4e', borderRadius: 8, background: '#fef9e7', marginBottom: 16 }}>
            ⚠️ 목록 API 미사용(폴백) — Case ID를 입력하여 해당 케이스의 정산 정보를 조회하세요.
          </div>

          <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
            <h3>🔍 케이스 정산 조회</h3>
            <form onSubmit={handleFallbackGo} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                placeholder="Case ID (UUID)"
                style={{ flex: 1, padding: 8 }}
              />
              <button type="submit" disabled={!caseId.trim()} style={{ padding: '8px 16px' }}>조회 →</button>
            </form>
            <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
              케이스 상세 페이지에서도 정산 정보를 확인할 수 있습니다.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

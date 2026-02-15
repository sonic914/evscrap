'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '../../NavBar';
import { useAuthGuard, handle401 } from '@/lib/useAuthGuard';
import { adminGet } from '@/lib/api';

interface MissingAnchor {
  event_id: string;
  event_type: string;
  created_at: string;
  target_type?: string;
  target_id?: string;
}

export default function MissingAnchorsPage() {
  const router = useRouter();
  const authed = useAuthGuard();
  const [items, setItems] = useState<MissingAnchor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authed) return;
    fetchMissingAnchors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  async function fetchMissingAnchors() {
    setLoading(true);
    setError('');
    try {
      const { data, error: apiErr, response } = await adminGet('/admin/v1/audit/missing-anchors');
      if (handle401(response?.status, router)) return;
      if (apiErr) { setError('앵커 누락 감사 조회 실패'); return; }
      setItems((data as any)?.missing_anchors || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }

  if (!authed) return <div className="loading">인증 확인 중...</div>;

  return (
    <>
      <NavBar />
      <div className="page">
        <h1>🔍 앵커 누락 감사</h1>
        <p style={{ color: '#666', marginBottom: 16, fontSize: 14 }}>
          블록체인 앵커가 누락된 이벤트를 조회합니다. 앵커 상태가 NONE이거나 FAILED인 이벤트가 표시됩니다.
        </p>

        {error && <div className="alert alert-error">{error}</div>}
        {loading ? (
          <div className="loading">로딩 중...</div>
        ) : items.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Event ID</th>
                <th>이벤트 타입</th>
                <th>대상</th>
                <th>생성일</th>
                <th>바로가기</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.event_id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{item.event_id.slice(0, 8)}…</td>
                  <td>{item.event_type}</td>
                  <td>{item.target_type && item.target_id ? `${item.target_type}/${item.target_id.slice(0, 8)}…` : '-'}</td>
                  <td>{new Date(item.created_at).toLocaleString('ko')}</td>
                  <td>
                    {item.target_type === 'CASE' && item.target_id ? (
                      <a href="#" onClick={(e) => { e.preventDefault(); router.push(`/cases/${item.target_id}`); }}>케이스 →</a>
                    ) : item.target_type === 'LOT' && item.target_id ? (
                      <a href="#" onClick={(e) => { e.preventDefault(); router.push(`/events?anchor_status=FAILED`); }}>이벤트 →</a>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="alert alert-success" style={{ marginTop: 16 }}>
            ✅ 앵커 누락 이벤트가 없습니다. 모든 이벤트가 정상 앵커링되었습니다.
          </div>
        )}

        <div className="actions" style={{ marginTop: 16 }}>
          <button onClick={fetchMissingAnchors} disabled={loading}>🔄 새로고침</button>
          <button onClick={() => router.push('/events?anchor_status=FAILED')}>FAILED 이벤트 보기 →</button>
        </div>
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { isLoggedIn } from '../lib/auth';

const API = import.meta.env.VITE_API_BASE || '';
const STATUS_LABELS: Record<string, string> = {
  OPEN: '접수', UNDER_REVIEW: '검토중', NEEDS_INFO: '정보요청',
  RESOLVED_ACCEPTED: '인정', RESOLVED_REJECTED: '기각',
};
const STATUS_COLORS: Record<string, string> = {
  OPEN: '#fd7e14', UNDER_REVIEW: '#007bff', NEEDS_INFO: '#ffc107',
  RESOLVED_ACCEPTED: '#28a745', RESOLVED_REJECTED: '#dc3545',
};
const REASON_LABELS: Record<string, string> = {
  AMOUNT_ERROR: '금액 오류', MISSING_ITEM: '누락 항목', GRADE_DISPUTE: '등급 이의', OTHER: '기타',
};

export default function DisputesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!isLoggedIn()) navigate('/login'); }, [navigate]);

  useEffect(() => {
    const token = localStorage.getItem('id_token') || '';
    fetch(`${API}/user/v1/disputes`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setItems(d.items || []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}><Link to="/">← 홈</Link></div>
      <h1>🚨 이의제기 목록</h1>
      {loading ? <p>로딩 중...</p> : items.length === 0 ? <p style={{ color: '#888' }}>이의제기 내역이 없습니다.</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
            <th style={{ padding: 8 }}>상태</th><th style={{ padding: 8 }}>사유</th>
            <th style={{ padding: 8 }}>설명</th><th style={{ padding: 8 }}>생성일</th>
          </tr></thead>
          <tbody>{items.map((d: any) => (
            <tr key={d.dispute_id || d.id} style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
              onClick={() => navigate(`/disputes/${d.dispute_id || d.id}`)}>
              <td style={{ padding: 8 }}>
                <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, color: '#fff', background: STATUS_COLORS[d.status] || '#999' }}>
                  {STATUS_LABELS[d.status] || d.status}
                </span>
              </td>
              <td style={{ padding: 8 }}>{REASON_LABELS[d.reason_code] || d.reason_code}</td>
              <td style={{ padding: 8, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.description}</td>
              <td style={{ padding: 8, fontSize: 12 }}>{new Date(d.created_at).toLocaleDateString('ko')}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

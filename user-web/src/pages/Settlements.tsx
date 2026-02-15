import { useEffect, useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { isLoggedIn, logout } from '../lib/auth';

export default function SettlementsPage() {
  const navigate = useNavigate();
  const [caseId, setCaseId] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) navigate('/login');
  }, [navigate]);

  function handleGo(e: FormEvent) {
    e.preventDefault();
    if (caseId.trim()) navigate(`/settlements/CASE/${caseId.trim()}`);
  }

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>💰 정산</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/">← 홈</Link>
          <button onClick={() => { logout(); navigate('/login'); }}>로그아웃</button>
        </div>
      </div>

      <div style={{ padding: 16, border: '1px solid #f0ad4e', borderRadius: 8, background: '#fef9e7', marginBottom: 16 }}>
        ⚠️ 정산 목록 API가 사용자에게 제공되지 않습니다. Case ID를 입력하여 해당 케이스의 정산 정보를 조회하세요.
      </div>

      <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
        <h3>🔍 케이스 정산 조회</h3>
        <form onSubmit={handleGo} style={{ display: 'flex', gap: 8 }}>
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
    </div>
  );
}

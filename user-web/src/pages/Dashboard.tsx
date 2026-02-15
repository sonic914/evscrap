import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { isLoggedIn, logout, getToken } from '../lib/auth';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [healthResult, setHealthResult] = useState('');
  const [healthLoading, setHealthLoading] = useState(false);

  const API_BASE = import.meta.env.VITE_API_BASE || '';

  async function handleHealthCheck() {
    setHealthLoading(true);
    setHealthResult('');
    try {
      const res = await fetch(`${API_BASE}health`, {
        headers: { 'x-correlation-id': crypto.randomUUID() },
      });
      const text = await res.text();
      setHealthResult(`${res.status} — ${text}`);
    } catch (err) {
      setHealthResult(`❌ ${err instanceof Error ? err.message : '네트워크 오류'}`);
    } finally {
      setHealthLoading(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>🚗 evscrap</h1>
        {isLoggedIn() ? (
          <button onClick={handleLogout}>로그아웃</button>
        ) : (
          <Link to="/login">로그인</Link>
        )}
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/cases" style={{ textDecoration: 'none' }}>
          <div style={{ padding: '16px 24px', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>
            <h2>📋 케이스</h2>
            <p style={{ color: '#666', fontSize: 14 }}>폐차 케이스 등록/조회</p>
          </div>
        </Link>
      </div>

      <div style={{ marginTop: 32 }}>
        <h3>🏥 Health Check</h3>
        <button onClick={handleHealthCheck} disabled={healthLoading} style={{ padding: '8px 16px' }}>
          {healthLoading ? '확인 중...' : 'GET /health'}
        </button>
        {healthResult && (
          <pre style={{ marginTop: 8, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
            {healthResult}
          </pre>
        )}
      </div>

      {isLoggedIn() && (
        <div style={{ marginTop: 16, fontSize: 12, color: '#999' }}>
          🔑 토큰 길이: {getToken()?.length || 0}자
        </div>
      )}
    </div>
  );
}

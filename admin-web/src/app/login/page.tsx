'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signInAdmin } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInAdmin(username, password);
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '로그인 실패');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '100px auto', padding: 24 }}>
      <h1 style={{ marginBottom: 24 }}>🔒 관리자 로그인</h1>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>사용자명</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <button type="submit" disabled={loading} className="primary" style={{ width: '100%', marginTop: 8 }}>
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  );
}

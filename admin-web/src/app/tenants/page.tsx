'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isLoggedIn, logout } from '@/lib/auth';
import { getAdminApi } from '@/lib/api';

interface Tenant {
  tenant_id: string;
  display_name: string;
  status: string;
  phone_number: string;
  created_at: string;
}

export default function TenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/login');
      return;
    }

    async function fetchTenants() {
      try {
        const api = getAdminApi();
        const { data, error: apiError } = await api.GET('/admin/v1/tenants');
        if (apiError) {
          setError('API 호출 실패');
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setTenants((data as any)?.tenants || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : '알 수 없는 오류');
      } finally {
        setLoading(false);
      }
    }

    fetchTenants();
  }, [router]);

  function handleLogout() {
    logout();
    router.push('/login');
  }

  if (loading) return <p style={{ padding: 24 }}>로딩 중...</p>;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>테넌트 관리</h1>
        <button onClick={handleLogout}>로그아웃</button>
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #333' }}>
            <th style={{ textAlign: 'left', padding: 8 }}>이름</th>
            <th style={{ textAlign: 'left', padding: 8 }}>상태</th>
            <th style={{ textAlign: 'left', padding: 8 }}>전화번호</th>
            <th style={{ textAlign: 'left', padding: 8 }}>생성일</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.tenant_id} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: 8 }}>{t.display_name}</td>
              <td style={{ padding: 8 }}>{t.status}</td>
              <td style={{ padding: 8 }}>{t.phone_number}</td>
              <td style={{ padding: 8 }}>{new Date(t.created_at).toLocaleDateString('ko')}</td>
            </tr>
          ))}
          {tenants.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: 8, textAlign: 'center' }}>
                등록된 테넌트가 없습니다
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

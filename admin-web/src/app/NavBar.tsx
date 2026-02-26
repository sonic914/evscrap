'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOutAdmin } from '@/lib/auth';

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    signOutAdmin();
    router.push('/login');
  }

  const links = [
    { href: '/', label: '대시보드' },
    { href: '/tenants', label: '테넌트' },
    { href: '/cases', label: '케이스' },
    { href: '/settlements', label: '정산' },
    { href: '/events', label: '이벤트' },
    { href: '/disputes', label: '이의제기' },
    { href: '/audit/missing-anchors', label: '감사' },
  ];

  return (
    <nav className="admin-nav">
      <span className="brand">evscrap Admin</span>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href)) ? 'active' : ''}
        >
          {l.label}
        </Link>
      ))}
      <span className="spacer" />
      <button onClick={handleLogout} style={{ color: '#ccc', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14 }}>
        로그아웃
      </button>
    </nav>
  );
}

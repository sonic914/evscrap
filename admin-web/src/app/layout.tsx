import type { Metadata } from 'next';
import './globals.css';
import DynamicPageRouter from './_components/DynamicPageRouter';

export const metadata: Metadata = {
  title: 'evscrap 관리자',
  description: 'evscrap Admin Dashboard',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <DynamicPageRouter>{children}</DynamicPageRouter>
      </body>
    </html>
  );
}

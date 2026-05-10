import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/sidebar';
import ExchangeRateBanner from '@/components/exchange-rate-banner';
import PrintMonitor from '@/components/print-monitor';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function getUser(token: string) {
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) {
    redirect('/login');
  }

  const user = await getUser(token);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto">
        <ExchangeRateBanner />
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
      <PrintMonitor />
    </div>
  );
}

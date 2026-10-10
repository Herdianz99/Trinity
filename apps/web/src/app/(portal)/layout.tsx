import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import SessionKeeper from '@/components/session-keeper';
import { NavGuardProvider } from '@/components/nav-guard';
import { SERVER_API_URL, forwardClientIpFromHeaders } from '@/lib/server-api';
import PortalHeader from './portal-header';

async function getUser(token: string) {
  try {
    const res = await fetch(`${SERVER_API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}`, ...forwardClientIpFromHeaders() },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// Portal de pedidos para clientes (rol CLIENT): sin el menu del ERP, pensado para el celular.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get('accessToken')?.value;
  if (!token) redirect('/login');
  const user = await getUser(token);
  if (user && user.role !== 'CLIENT') redirect('/dashboard');

  return (
    <div className="min-h-screen bg-slate-950">
      <PortalHeader name={user?.name ?? ''} />
      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 pb-28">
        <NavGuardProvider>{children}</NavGuardProvider>
      </main>
      <SessionKeeper />
    </div>
  );
}

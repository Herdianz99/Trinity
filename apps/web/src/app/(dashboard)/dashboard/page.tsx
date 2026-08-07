import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import DashboardGerencialClient from './gerencial-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function getRole(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.role ?? null;
  } catch {
    return null;
  }
}

// Server component: decide el dashboard por ROL en el servidor, ANTES de enviar HTML.
// Asi cada rol entra directo a SU dashboard sin pasar por el gerencial. Antes esto se hacia
// en el cliente (fetch + router.replace), lo que dejaba una ventana de segundos en la que
// vendedores/cajeros/auditores alcanzaban a ver el total vendido. Ya no.
export default async function DashboardPage() {
  const token = cookies().get('accessToken')?.value;
  if (!token) redirect('/login');

  const role = await getRole(token);
  if (role === 'SELLER') redirect('/dashboard/seller');
  // SEGURIDAD no tiene modulo 'dashboard': entra directo a su unico modulo (incidencias).
  if (role === 'SEGURIDAD') redirect('/incidents');
  if (role !== 'ADMIN' && role !== 'SUPERVISOR') redirect('/dashboard/home');

  // Solo ADMIN / SUPERVISOR llegan aqui y reciben el gerencial (con los totales).
  return <DashboardGerencialClient />;
}

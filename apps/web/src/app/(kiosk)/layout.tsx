import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Baloo_2 } from 'next/font/google';
import SessionKeeper from '@/components/session-keeper';

const baloo = Baloo_2({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-clover' });

// Totem del piso de venta (Clover): pantalla completa, sin el menu del ERP. La sesion se renueva sola.
export default function KioskLayout({ children }: { children: React.ReactNode }) {
  if (!cookies().get('accessToken')?.value) redirect('/login');
  return (
    <div
      className={`${baloo.variable} min-h-[100dvh] overflow-hidden text-white select-none`}
      style={{
        fontFamily: 'var(--font-clover), system-ui, sans-serif',
        background: 'radial-gradient(120% 70% at 50% 18%, #1b3f7a 0%, #0c2148 45%, #06132b 100%)',
      }}
    >
      {children}
      <SessionKeeper />
    </div>
  );
}

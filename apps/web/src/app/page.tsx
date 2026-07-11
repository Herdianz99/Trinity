import { redirect } from 'next/navigation';

export default function Home() {
  // Enviar al dashboard. El middleware decide el resto segun la sesion:
  // sin token -> /login, mustChangePassword -> /change-password, con token -> dashboard (enruta por rol).
  // (Antes redirigia siempre a /login, sacando al usuario aunque tuviera sesion abierta.)
  redirect('/dashboard');
}

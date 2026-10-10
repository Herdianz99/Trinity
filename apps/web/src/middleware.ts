import { NextRequest, NextResponse } from 'next/server';

const publicPaths = ['/login', '/api/auth/login', '/api/auth/refresh', '/manifest.webmanifest', '/sw.js', '/icons'];

// Map route prefixes to acceptable permission keys (ANY of them grants access)
// More specific routes must come before less specific ones
const ROUTE_PERMISSION_MAP: [string, string[]][] = [
  ['/commands', ['commands']],
  ['/dispatch', ['commands', 'inventory', 'inventory-consult']],
  ['/store', ['store']],
  ['/catalog/suppliers', ['purchases']],
  // Sesiones de fotos / codigos de barras: tambien accesibles desde Inventario (incl. solo-consulta)
  ['/catalog/photo-session', ['catalog', 'inventory', 'inventory-consult']],
  ['/catalog/barcode-session', ['catalog', 'inventory', 'inventory-consult']],
  ['/quotations', ['sales']],
  ['/sales/pedidos-clientes', ['pedidos-clientes']],
  ['/sales', ['sales']],
  ['/catalog', ['catalog']],
  // Paginas de inventario de SOLO CONSULTA: tambien las puede ver 'inventory-consult'
  ['/inventory/articulos', ['inventory', 'inventory-consult']],
  ['/inventory/etiquetas', ['inventory', 'inventory-consult']],
  ['/inventory/replacements', ['inventory', 'inventory-consult']],
  // Resumen gerencial, alertas y reporte de danos: tambien accesibles desde el modulo de Almacen ('almacen')
  ['/inventory/summary', ['inventory', 'almacen']],
  ['/inventory/alerts', ['inventory', 'almacen']],
  ['/inventory/damage-reports', ['inventory', 'almacen']],
  ['/inventory/goods-receipts', ['inventory', 'almacen']],
  ['/inventory', ['inventory']],
  ['/purchases', ['purchases']],
  ['/pedidos', ['pedidos']],
  ['/cash', ['cash']],
  ['/receivables', ['receivables']],
  ['/payment-schedules', ['payment-schedules']],
  ['/payables', ['payables']],
  ['/fiscal', ['fiscal']],
  ['/incidents', ['incidents']],
  ['/settings', ['settings']],
  ['/config', ['settings']],
  ['/users', ['settings']],
  ['/import', ['settings']],
];

function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function hasPermission(permissions: string[], requiredPermission: string): boolean {
  if (permissions.includes('*')) return true;
  return permissions.includes(requiredPermission);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('accessToken')?.value;

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Decode JWT to check permissions and mustChangePassword
  const payload = decodeJwtPayload(token);

  if (!payload) {
    return NextResponse.next();
  }

  // If mustChangePassword and not already on /change-password, redirect
  if (payload.mustChangePassword && !pathname.startsWith('/change-password') && !pathname.startsWith('/api/')) {
    return NextResponse.redirect(new URL('/change-password', request.url));
  }

  // Portal de clientes: un usuario CLIENT solo navega su portal (y cambiar clave); cualquier
  // otra pantalla lo manda a /portal. Al reves, el personal no usa /portal.
  if (!pathname.startsWith('/api/')) {
    const isClient = payload.role === 'CLIENT';
    if (isClient && !pathname.startsWith('/portal') && !pathname.startsWith('/change-password')) {
      return NextResponse.redirect(new URL('/portal', request.url));
    }
    if (!isClient && pathname.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Check route permissions (skip for API routes, dashboard, change-password, and 403)
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/dashboard') && !pathname.startsWith('/change-password') && pathname !== '/403') {
    const permissions: string[] = payload.permissions || [];

    // Find the matching route permission (any of the acceptable keys grants access)
    for (const [routePrefix, allowedKeys] of ROUTE_PERMISSION_MAP) {
      if (pathname.startsWith(routePrefix)) {
        if (!allowedKeys.some((key) => hasPermission(permissions, key))) {
          return NextResponse.redirect(new URL('/403', request.url));
        }
        break;
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // pdfjs: worker de pdf.js servido desde /public (estático, sin datos; no requiere sesión)
    '/((?!_next/static|_next/image|favicon.ico|public|pdfjs).*)',
  ],
};

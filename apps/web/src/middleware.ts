import { NextRequest, NextResponse } from 'next/server';

const publicPaths = ['/login', '/api/auth/login', '/api/auth/refresh'];

// Map route prefixes to permission keys
// More specific routes must come before less specific ones
const ROUTE_PERMISSION_MAP: [string, string][] = [
  ['/catalog/suppliers', 'purchases'],
  ['/quotations', 'sales'],
  ['/sales', 'sales'],
  ['/catalog', 'catalog'],
  ['/inventory', 'inventory'],
  ['/purchases', 'purchases'],
  ['/cash', 'cash'],
  ['/receivables', 'receivables'],
  ['/payables', 'payables'],
  ['/fiscal', 'fiscal'],
  ['/settings', 'settings'],
  ['/config', 'settings'],
  ['/users', 'settings'],
  ['/import', 'settings'],
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

  // Check route permissions (skip for API routes, dashboard, change-password, and 403)
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/dashboard') && !pathname.startsWith('/change-password') && pathname !== '/403') {
    const permissions: string[] = payload.permissions || [];

    // Find the matching route permission
    for (const [routePrefix, permissionKey] of ROUTE_PERMISSION_MAP) {
      if (pathname.startsWith(routePrefix)) {
        if (!hasPermission(permissions, permissionKey)) {
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
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};

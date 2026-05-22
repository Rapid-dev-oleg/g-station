/**
 * Middleware-защита маршрутов.
 * Все маршруты, кроме /login и /api/auth/*, требуют авторизации.
 * Неавторизованных редиректит на /login.
 */
import { auth } from '@/server/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = pathname === '/login' || pathname.startsWith('/api/auth');

  if (!req.auth && !isPublic) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  if (req.auth && pathname === '/login') {
    return NextResponse.redirect(new URL('/', req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // Исключаем статику Next.js и файлы; /api/auth обрабатывается внутри.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|css|js)$).*)'],
};

/**
 * Конфигурация Auth.js v5 (next-auth beta).
 * Вход по email+пароль (CredentialsProvider), JWT-сессия.
 * В токен/сессию кладутся id и role пользователя.
 */
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import type { Role } from '@prisma/client';
import { db } from '@/server/db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Пароль', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';
        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.sub ?? '';
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
});

/**
 * Требует авторизованного пользователя.
 * Для использования в server actions / services.
 * Редиректит на /login, если сессии нет.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return session.user;
}

/**
 * Требует роль ADMIN.
 * Редиректит на /login без сессии, бросает ошибку при недостатке прав.
 */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== ('ADMIN' satisfies Role)) {
    throw new Error('Доступ запрещён: требуется роль ADMIN');
  }
  return user;
}

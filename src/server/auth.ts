/**
 * Конфигурация Auth.js v5 (next-auth beta).
 * Вход по email+пароль (CredentialsProvider), JWT-сессия.
 * В токен/сессию кладутся id и флаг isSuperAdmin (роли внутри воркспейса — в БД,
 * через Membership; проверяются точечно на страницах воркспейса).
 */
import { cache } from 'react';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
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
        if (!user || !user.isActive) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isSuperAdmin: user.isSuperAdmin,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.sub ?? '';
        token.isSuperAdmin = user.isSuperAdmin ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.isSuperAdmin = token.isSuperAdmin;
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
export const requireUser = cache(async () => {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return session.user;
});

/**
 * Требует платформенного супер-админа (НейроСофт).
 * Редиректит на /login без сессии, бросает ошибку при недостатке прав.
 * Используется на странице управления доступом (/admin) и в её server actions.
 */
export async function requireSuperAdmin() {
  const user = await requireUser();
  if (!user.isSuperAdmin) {
    throw new Error('Доступ запрещён: требуются права супер-администратора');
  }
  return user;
}

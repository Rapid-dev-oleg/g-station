/** Расширение типов next-auth: в сессии/токене есть id и флаг супер-админа. */
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      isSuperAdmin: boolean;
    } & DefaultSession['user'];
  }

  interface User {
    id?: string;
    isSuperAdmin?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    isSuperAdmin: boolean;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string;
    isSuperAdmin: boolean;
  }
}
